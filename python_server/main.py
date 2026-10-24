"""Vainah VPN Python host, with temporary local adapter for existing JS functions."""
import asyncio
import os
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / "site"
FUNCTIONS = ROOT / "netlify" / "functions"
BRIDGE_HOST = "127.0.0.1"
BRIDGE_PORT = int(os.getenv("VAINAH_BRIDGE_PORT", "18787"))
BRIDGE_URL = f"http://{BRIDGE_HOST}:{BRIDGE_PORT}"
MAX_BODY = 1_048_576
NAME_PATTERN = re.compile(r"^[a-z0-9][a-z0-9-]{0,70}$")
SKIP_HEADERS = {"connection", "host", "transfer-encoding", "content-length", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "upgrade"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not SITE.is_dir() or not FUNCTIONS.is_dir():
        raise RuntimeError("Run the application from the complete Vainah VPN repository")
    # Render supplies a public HTTPS origin automatically. Keep explicit overrides possible.
    if not os.environ.get("PUBLIC_SITE_ORIGIN"):
        hosted_origin = os.environ.get("RENDER_EXTERNAL_URL", "")
        if hosted_origin.startswith("https://"):
            os.environ["PUBLIC_SITE_ORIGIN"] = hosted_origin.rstrip("/")
    internal_key = secrets.token_urlsafe(32)
    process = await asyncio.create_subprocess_exec(
        "node", str(Path(__file__).with_name("legacy_bridge.mjs")),
        cwd=str(ROOT),
        env={**os.environ, "VAINAH_BRIDGE_PORT": str(BRIDGE_PORT), "VAINAH_BRIDGE_SECRET": internal_key},
    )
    app.state.node_process = process
    app.state.internal_key = internal_key
    app.state.http = httpx.AsyncClient(trust_env=False, timeout=30.0, follow_redirects=False)
    try:
        for _ in range(80):
            if process.returncode is not None:
                raise RuntimeError("Vainah compatibility worker stopped during startup")
            try:
                response = await app.state.http.get(
                    BRIDGE_URL + "/__bridge_health",
                    headers={"X-Vainah-Internal-Key": internal_key}, timeout=0.5,
                )
                if response.status_code == 200:
                    break
            except (httpx.RequestError, httpx.TimeoutException):
                pass
            await asyncio.sleep(0.1)
        else:
            raise RuntimeError("Could not start Vainah compatibility worker")
        yield
    finally:
        await app.state.http.aclose()
        if process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()


app = FastAPI(title="Vainah VPN Python Server", lifespan=lifespan, docs_url=None, redoc_url=None)


@app.get("/api/health")
async def health(request: Request):
    """Liveness only; no subscriber information or secrets."""
    worker = request.app.state.node_process
    return JSONResponse(
        {"ok": worker.returncode is None, "service": "vainah-python"},
        status_code=200 if worker.returncode is None else 503,
        headers={"Cache-Control": "no-store"},
    )


@app.api_route("/.netlify/functions/{name}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"])
async def legacy_function(name: str, request: Request):
    """Keep browser URLs compatible, but route everything to our own worker."""
    if not NAME_PATTERN.fullmatch(name) or not (FUNCTIONS / f"{name}.mjs").is_file():
        return JSONResponse({"error": "Not found"}, status_code=404)
    if (request.headers.get("content-length") or "").isdigit() and int(request.headers["content-length"]) > MAX_BODY:
        return JSONResponse({"error": "Too large"}, status_code=413)
    body = await request.body()
    if len(body) > MAX_BODY:
        return JSONResponse({"error": "Too large"}, status_code=413)
    request_headers = [(k, v) for k, v in request.headers.raw if k.decode("latin1").lower() not in SKIP_HEADERS | {"x-vainah-internal-key"}]
    request_headers.append((b"x-vainah-internal-key", request.app.state.internal_key.encode("ascii")))
    try:
        upstream = await request.app.state.http.request(
            request.method, f"{BRIDGE_URL}/{name}",
            params=request.query_params, headers=request_headers, content=body,
        )
    except (httpx.RequestError, httpx.TimeoutException):
        return JSONResponse({"error": "Service unavailable"}, status_code=503, headers={"Cache-Control": "no-store"})
    response = Response(content=upstream.content, status_code=upstream.status_code)
    response.raw_headers = [(k, v) for k, v in upstream.headers.raw if k.decode("latin1").lower() not in SKIP_HEADERS]
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    if request.url.path in {"/account.html", "/checkout.html", "/payment-result.html", "/rollypay-sandbox.html", "/admin-payment-check.html"}:
        response.headers["Cache-Control"] = "no-store"
    if request.url.path in {"/rollypay-sandbox.html", "/admin-payment-check.html"}:
        response.headers["X-Robots-Tag"] = "noindex, nofollow"
    return response


app.mount("/", StaticFiles(directory=str(SITE), html=True), name="site")

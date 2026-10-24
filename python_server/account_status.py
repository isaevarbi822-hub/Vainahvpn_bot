"""Read-only, privacy-preserving health of the currently logged-in Vainah account."""
import asyncio

import httpx
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

router = APIRouter()
NO_STORE = {"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"}


async def bridge_get(request: Request, name: str):
    """Server-only localhost calls; never send user-specified paths or arguments."""
    try:
        response = await request.app.state.http.get(
            "http://127.0.0.1:" + str(__import__("os").environ.get("VAINAH_BRIDGE_PORT", "18787")) + "/" + name,
            headers={
                "x-vainah-internal-key": request.app.state.internal_key,
                "cookie": request.headers.get("cookie", ""),
                "accept": "application/json",
            },
            timeout=12,
        )
        if len(response.content) > 65536:
            return None, 503
        return response.json(), response.status_code
    except (httpx.HTTPError, ValueError):
        return None, 503


@router.get("/api/account/status")
async def account_status(request: Request):
    """Only statuses. Never expose Telegram IDs, raw H1 profile, keys, or orders."""
    auth, code = await bridge_get(request, "telegram-account")
    if code != 200 or not isinstance(auth, dict):
        return JSONResponse({"authenticated": False, "api": "unavailable"}, status_code=503, headers=NO_STORE)
    if auth.get("authenticated") is not True or not isinstance(auth.get("user"), dict):
        return JSONResponse({"authenticated": False}, status_code=401, headers=NO_STORE)
    (h1, hcode), (orders, ocode) = await asyncio.gather(
        bridge_get(request, "my-subscription"),
        bridge_get(request, "website-account-overview"),
    )
    if hcode == 200 and isinstance(h1, dict):
        h1_status = {
            "reachable": h1.get("panelReady") is True,
            "profileFound": h1.get("found") is True,
            "active": h1.get("active") is True,
        }
    else:
        h1_status = {"reachable": False, "error": "read_failed"}
    if ocode == 200 and isinstance(orders, dict) and isinstance(orders.get("orders"), list):
        orders_status = {"reachable": True, "count": len(orders["orders"])}
    else:
        orders_status = {"reachable": False, "error": "read_failed"}
    return JSONResponse(
        {"authenticated": True, "h1cloud": h1_status, "websiteOrders": orders_status},
        headers=NO_STORE,
    )

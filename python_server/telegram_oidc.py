"""Secure Telegram OIDC Authorization Code + PKCE, replacing the deprecated iframe."""
import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from urllib.parse import urlencode, urlparse

import httpx
import jwt
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, RedirectResponse

router = APIRouter()
ORIGIN = "https://oauth.telegram.org"
FLOW_COOKIE = "__Host-vainah_oidc"
SESSION_COOKIE = "__Host-vainah_session"
VALID_ID = re.compile(r"^[1-9][0-9]{0,17}$")


def settings():
    client = os.getenv("TELEGRAM_OIDC_CLIENT_ID", "").strip()
    secret = os.getenv("TELEGRAM_OIDC_CLIENT_SECRET", "").strip()
    signing = os.getenv("SESSION_SIGNING_KEY", "")
    site = os.getenv("PUBLIC_SITE_ORIGIN", "").strip()
    try:
        url = urlparse(site)
        if not (url.scheme == "https" and url.hostname and not url.path
                and not url.query and not url.fragment and not url.username
                and not url.password and not url.port and url.geturl() == site):
            return None
    except ValueError:
        return None
    if not re.fullmatch(r"[0-9]{1,20}", client) or len(secret) < 16 or len(signing) < 32:
        return None
    return client, secret, signing, site


def b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def signature(text: str, secret: str) -> str:
    return hmac.new(secret.encode(), text.encode("ascii"), hashlib.sha256).hexdigest()


def flow_token(payload: dict, secret: str) -> str:
    raw = b64(json.dumps(payload, separators=(",", ":")).encode())
    return raw + "." + signature(raw, secret)


def read_flow(raw: str, secret: str):
    if not raw or len(raw) > 2200:
        return None
    try:
        body, mac = raw.split(".")
        if not re.fullmatch(r"[a-f0-9]{64}", mac) or not hmac.compare_digest(signature(body, secret), mac):
            return None
        payload = json.loads(base64.urlsafe_b64decode(body + "=" * (-len(body) % 4)))
        if not isinstance(payload, dict) or not isinstance(payload.get("exp"), int):
            return None
        if not time.time() < payload["exp"] <= time.time() + 660:
            return None
        for field in ("state", "verifier", "nonce"):
            if not isinstance(payload.get(field), str) or not 12 <= len(payload[field]) <= 128:
                return None
        return payload
    except (ValueError, TypeError, UnicodeError):
        return None


def create_session(telegram_id: str, username: str, key: str) -> str:
    """Matches the existing HMAC session in telegram-identity.mjs."""
    payload = {"id": telegram_id, "username": username[:32], "exp": int(time.time()) + 604800}
    body = b64(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    return body + "." + signature(body, key)


def verify_token(token: str, jwks: dict, client: str, nonce: str):
    if not isinstance(token, str) or len(token) > 16000:
        raise ValueError("Invalid token")
    header = jwt.get_unverified_header(token)
    if header.get("alg") != "RS256" or not isinstance(header.get("kid"), str):
        raise ValueError("Unsupported token algorithm")
    keys = [k for k in jwt.PyJWKSet.from_dict(jwks).keys
            if k.key_id == header["kid"] and k.algorithm_name == "RS256"]
    if len(keys) != 1:
        raise ValueError("Unknown signing key")
    claims = jwt.decode(
        token, keys[0].key, algorithms=["RS256"], audience=client,
        issuer=ORIGIN, leeway=30,
        options={"require": ["iss", "aud", "exp", "iat", "sub", "nonce"]},
    )
    if not hmac.compare_digest(str(claims.get("nonce", "")), nonce):
        raise ValueError("Nonce mismatch")
    user_id = str(claims.get("id", ""))
    if not VALID_ID.fullmatch(user_id):
        raise ValueError("Missing Telegram user ID")
    if not str(claims.get("sub", "")).strip():
        raise ValueError("Missing subject")
    return user_id, str(claims.get("preferred_username") or "")[:32]


def error_redirect(reason="error"):
    result = RedirectResponse("/account.html?telegram_login=" + reason, status_code=303)
    result.delete_cookie(FLOW_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    result.headers["Cache-Control"] = "no-store"
    return result


@router.get("/api/auth/telegram-status")
async def telegram_status():
    return JSONResponse({"oidcConfigured": settings() is not None}, headers={"Cache-Control": "no-store"})


@router.get("/auth/telegram/start")
async def telegram_start():
    cfg = settings()
    if not cfg:
        return error_redirect("not_configured")
    client, _, key, site = cfg
    state = secrets.token_urlsafe(32)
    nonce = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(48)
    challenge = b64(hashlib.sha256(verifier.encode()).digest())
    flow = flow_token({"state": state, "nonce": nonce, "verifier": verifier,
                       "exp": int(time.time()) + 600}, key)
    args = {
        "client_id": client, "redirect_uri": site + "/auth/telegram/callback",
        "response_type": "code", "scope": "openid profile",
        "state": state, "nonce": nonce, "code_challenge": challenge, "code_challenge_method": "S256",
    }
    response = RedirectResponse(ORIGIN + "/auth?" + urlencode(args), status_code=302)
    response.set_cookie(FLOW_COOKIE, flow, max_age=600, secure=True,
                        httponly=True, samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


@router.get("/auth/telegram/callback")
async def telegram_callback(request: Request):
    cfg = settings()
    if not cfg or request.query_params.get("error"):
        return error_redirect()
    client, client_secret, signing, site = cfg
    state = request.query_params.get("state", "")
    code = request.query_params.get("code", "")
    flow = read_flow(request.cookies.get(FLOW_COOKIE, ""), signing)
    if not flow or not 10 <= len(code) <= 4096 or not hmac.compare_digest(flow["state"], state):
        return error_redirect()
    try:
        http = request.app.state.http
        result = await http.post(
            ORIGIN + "/token",
            data={"grant_type": "authorization_code", "code": code,
                  "client_id": client, "redirect_uri": site + "/auth/telegram/callback",
                  "code_verifier": flow["verifier"]},
            auth=httpx.BasicAuth(client, client_secret), follow_redirects=False, timeout=10.0,
        )
        if result.status_code != 200 or len(result.content) > 32768:
            return error_redirect()
        id_token = result.json().get("id_token")
        keys_response = await http.get(
            ORIGIN + "/.well-known/jwks.json", timeout=10.0, follow_redirects=False,
        )
        if keys_response.status_code != 200 or len(keys_response.content) > 65536:
            return error_redirect()
        user_id, username = verify_token(id_token, keys_response.json(), client, flow["nonce"])
    except (httpx.HTTPError, ValueError, KeyError, TypeError, jwt.PyJWTError):
        return error_redirect()
    response = RedirectResponse("/account.html?telegram_login=success", status_code=303)
    response.set_cookie(
        SESSION_COOKIE, create_session(user_id, username, signing),
        max_age=604800, path="/", secure=True, httponly=True, samesite="lax",
    )
    response.delete_cookie(FLOW_COOKIE, path="/", secure=True, httponly=True, samesite="lax")
    response.headers["Cache-Control"] = "no-store"
    return response

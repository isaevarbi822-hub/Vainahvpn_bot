"""Security and integration checks for Telegram OIDC. No real logins or payments."""
import base64
import hashlib
import hmac
import json
import time
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from python_server.main import app
from python_server.telegram_oidc import (
    create_session, flow_token, read_flow, settings, verify_token
)


def test_signed_flow_expiry_and_tampering():
    signing = "s" * 48
    data = {"state": "1" * 32, "nonce": "2" * 32, "verifier": "3" * 64,
            "exp": int(time.time()) + 120}
    token = flow_token(data, signing)
    assert read_flow(token, signing) == data
    assert read_flow(token[:-1] + ("a" if token[-1] != "a" else "b"), signing) is None
    assert read_flow(flow_token({**data, "exp": 1}, signing), signing) is None


def test_cookie_matches_existing_node_session():
    signing = "s" * 48
    token = create_session("123456", "example", signing)
    raw, signature = token.split(".")
    assert signature == hmac.new(signing.encode(), raw.encode(), hashlib.sha256).hexdigest()
    contents = json.loads(base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4)))
    assert contents["id"] == "123456"
    assert contents["username"] == "example"
    assert contents["exp"] > time.time()


def test_config_refuses_insecure_redirect(monkeypatch):
    monkeypatch.setenv("TELEGRAM_OIDC_CLIENT_ID", "123456")
    monkeypatch.setenv("TELEGRAM_OIDC_CLIENT_SECRET", "k" * 32)
    monkeypatch.setenv("SESSION_SIGNING_KEY", "s" * 40)
    monkeypatch.setenv("PUBLIC_SITE_ORIGIN", "https://preview.example")
    assert settings() is not None
    for bad in ("http://preview.example", "https://preview.example/evil",
                "https://bad@preview.example", "https://preview.example:444"):
        monkeypatch.setenv("PUBLIC_SITE_ORIGIN", bad)
        assert settings() is None


def test_login_start_uses_state_pkce_nonce(monkeypatch):
    monkeypatch.setenv("TELEGRAM_OIDC_CLIENT_ID", "123456")
    monkeypatch.setenv("TELEGRAM_OIDC_CLIENT_SECRET", "k" * 32)
    monkeypatch.setenv("SESSION_SIGNING_KEY", "s" * 40)
    monkeypatch.setenv("PUBLIC_SITE_ORIGIN", "https://preview.example")
    with TestClient(app, follow_redirects=False) as client:
        assert client.get("/api/auth/telegram-status").json()["oidcConfigured"] is True
        response = client.get("/auth/telegram/start")
        assert response.status_code == 302
        query = parse_qs(urlparse(response.headers["location"]).query)
        assert query["client_id"] == ["123456"]
        assert query["scope"] == ["openid profile"]
        assert query["redirect_uri"] == ["https://preview.example/auth/telegram/callback"]
        assert query["code_challenge_method"] == ["S256"]
        assert len(query["state"][0]) >= 32
        assert len(query["nonce"][0]) >= 32
        assert "httponly" in response.headers["set-cookie"].lower()
        assert "secure" in response.headers["set-cookie"].lower()
        bad = client.get("/auth/telegram/callback?code=reallylongcode&state=invalid")
        assert bad.status_code == 303
        assert "telegram_login=error" in bad.headers["location"]


def test_unconfigured_oidc_denies_start(monkeypatch):
    monkeypatch.delenv("TELEGRAM_OIDC_CLIENT_ID", raising=False)
    monkeypatch.delenv("TELEGRAM_OIDC_CLIENT_SECRET", raising=False)
    with TestClient(app, follow_redirects=False) as client:
        assert client.get("/api/auth/telegram-status").json()["oidcConfigured"] is False
        result = client.get("/auth/telegram/start")
        assert result.status_code == 303
        assert "not_configured" in result.headers["location"]


def test_id_token_signature_issuer_audience_and_nonce():
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(private.public_key()))
    public_jwk["kid"] = "test-key"
    jwks = {"keys": [public_jwk]}
    claims = {
        "iss": "https://oauth.telegram.org",
        "aud": "123456",
        "sub": "12345600000000",
        "id": 9999,
        "preferred_username": "example",
        "nonce": "nonce-secret",
        "iat": int(time.time()) - 5,
        "exp": int(time.time()) + 120,
    }
    token = jwt.encode(claims, private, algorithm="RS256", headers={"kid": "test-key"})
    assert verify_token(token, jwks, "123456", "nonce-secret") == ("9999", "example")
    with pytest.raises((ValueError, jwt.PyJWTError)):
        verify_token(token, jwks, "123456", "wrong-nonce")
    with pytest.raises((ValueError, jwt.PyJWTError)):
        verify_token(token, jwks, "wrong-client", "nonce-secret")
    with pytest.raises((ValueError, jwt.PyJWTError)):
        verify_token(token + "bad", jwks, "123456", "nonce-secret")

"""Privacy-safe account diagnostics: authenticated sessions and no private data leaks."""
from fastapi.testclient import TestClient

from python_server.main import app
from python_server.telegram_oidc import create_session


def test_account_status_requires_valid_session(monkeypatch):
    monkeypatch.setenv("PUBLIC_SITE_ORIGIN", "https://preview.example")
    monkeypatch.setenv("SESSION_SIGNING_KEY", "z" * 48)
    with TestClient(app) as client:
        r = client.get("/api/account/status")
        assert r.status_code == 401
        assert r.json() == {"authenticated": False}
        assert r.headers.get("cache-control") == "no-store"


def test_account_status_reports_no_orders_without_exposing_id(monkeypatch):
    monkeypatch.setenv("PUBLIC_SITE_ORIGIN", "https://preview.example")
    monkeypatch.setenv("SESSION_SIGNING_KEY", "z" * 48)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PANEL_BASE_URL", raising=False)
    monkeypatch.delenv("PANEL_API_TOKEN", raising=False)
    value = create_session("123456789", "myname", "z" * 48)
    with TestClient(app) as client:
        result = client.get(
            "/api/account/status",
            headers={"Cookie": "__Host-vainah_session=" + value},
        )
        assert result.status_code == 200
        body = result.json()
        assert body["authenticated"] is True
        assert body["h1cloud"] == {"reachable": False, "profileFound": False, "active": False}
        assert body["websiteOrders"] == {"reachable": False, "error": "read_failed"}
        assert "123456789" not in str(body)
        assert "myname" not in str(body)
        assert "z" * 48 not in str(body)

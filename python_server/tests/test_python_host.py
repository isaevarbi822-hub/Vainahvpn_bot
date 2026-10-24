"""Read-only smoke test. Never executes payments or creates VPN accounts."""
import os
from fastapi.testclient import TestClient
from python_server.main import app

def test_static_frontend_and_existing_read_only_api():
    os.environ["PUBLIC_SITE_ORIGIN"] = "http://127.0.0.1:8000"
    os.environ["VAINAH_LIVE_CHECKOUT"] = "disabled"
    os.environ["VAINAH_PAYMENT_INTEGRATION_VERIFIED"] = "not-verified"
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/api/health").json() == {"ok": True, "service": "vainah-python"}
        result = client.get("/.netlify/functions/subscription-plans")
        assert result.status_code == 200
        data = result.json()
        assert len(data["plans"]) == 6
        assert data["checkoutReady"] is False
        assert client.get("/.netlify/functions/no-such-function").status_code == 404

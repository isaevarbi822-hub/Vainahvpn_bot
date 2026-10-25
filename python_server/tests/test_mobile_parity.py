"""Migration smoke checks: mobile endpoints are routed by Python's local worker.

No Clerk tokens, payment keys or database URLs are supplied in these tests.
They must NEVER create invoices or deliver VPN keys under preview settings.
"""
from fastapi.testclient import TestClient
from python_server.main import app


def test_mobile_read_only_endpoints_exist_but_require_authorization(monkeypatch):
    monkeypatch.setenv("PUBLIC_SITE_ORIGIN", "http://127.0.0.1:8000")
    monkeypatch.setenv("VAINAH_LIVE_CHECKOUT", "disabled")
    monkeypatch.setenv("VAINAH_PAYMENT_INTEGRATION_VERIFIED", "not-verified")
    monkeypatch.setenv("VAINAH_NATIVE_CHECKOUT", "disabled")
    monkeypatch.delenv("CLERK_SECRET_KEY", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    with TestClient(app) as client:
        auth = client.get("/.netlify/functions/mobile-auth")
        assert auth.status_code == 200
        assert auth.json()["authenticated"] is False
        assert auth.json()["available"] is False

        orders = client.get("/.netlify/functions/mobile-orders")
        assert orders.status_code == 401
        assert orders.json().get("error")

        order = client.get(
            "/.netlify/functions/mobile-order?order="
            "00000000-0000-4000-8000-000000000000"
        )
        assert order.status_code == 401

        # Fails closed before ANY invoice, database or RollyPay operation.
        create = client.post("/.netlify/functions/mobile-checkout", json={"plan": "30"})
        assert create.status_code == 401

        plans = client.get("/.netlify/functions/subscription-plans")
        assert plans.status_code == 200
        assert plans.json()["checkoutReady"] is False

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import create_app, safe_pay_url, validate_payment, ProviderFailure

TOKEN = "local-test-token-abcdefghijklmnopqrstuvwxyz"


def app_client(*, mode="mock", transport=None):
    app = create_app(mode=mode, dev_token=TOKEN, api_key="TEST_ONLY_FAKE_KEY",
                     transport=transport)
    return TestClient(app)


def headers():
    return {"X-Dev-Token": TOKEN}


def test_local_mock_flow_does_not_contact_provider():
    with app_client() as client:
        assert client.get("/health").json()["mode"] == "mock"
        assert client.post("/sandbox/start").status_code == 401
        created = client.post("/sandbox/start", headers=headers()).json()
        assert created["status"] == "created"
        assert created["pay_url"] is None
        assert created["real_money_charged"] is False
        assert created["vpn_delivered"] is False
        oid = created["order_id"]
        paid = client.post(f"/sandbox/{oid}/simulate", json={"status": "paid"},
                           headers=headers()).json()
        assert paid["status"] == "paid"
        assert paid["simulated"] is True
        assert client.get(f"/sandbox/{oid}", headers=headers()).json()["status"] == "paid"
        assert client.post(f"/sandbox/{oid}/simulate", json={"status": "canceled"},
                           headers=headers()).status_code == 409


def test_unknown_orders_and_invalid_input_fail_closed():
    with app_client() as client:
        assert client.get("/sandbox/vainah_py_sbx_" + "0" * 32,
                          headers=headers()).status_code == 404
        created = client.post("/sandbox/start", headers=headers()).json()
        path = f"/sandbox/{created['order_id']}/simulate"
        assert client.post(path, headers=headers(), json={"status": "refunded"}).status_code == 422
        assert client.post(path, headers=headers(), json={"status": "paid", "test": False}).status_code == 422
        assert client.post(path, json={"status": "paid"}).status_code == 401


def test_provider_sends_only_test_true_and_validates_full_response(monkeypatch):
    monkeypatch.setenv("VAINAH_ALLOW_PROVIDER_TEST_ONLY", "enabled")
    calls = []

    def server(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        assert request.headers["X-API-Key"] == "TEST_ONLY_FAKE_KEY"
        assert request.headers["X-Nonce"]
        if request.method == "POST":
            import json
            sent = json.loads(request.content)
            assert sent["test"] is True
            assert sent["amount"] == "10.00"
            assert "payment_method" not in sent  # don't require SBP terminal
            assert "terminal_id" not in sent
            assert "success_redirect_url" not in sent  # localhost isn't public
            return httpx.Response(200, json={
                "order_id": sent["order_id"], "payment_id": "pay_mockedprovider12345",
                "pay_url": "https://pay.rollypay.io/pay/tok_mocked12345",
                "amount": "10.00", "payment_currency": "RUB",
                "test": True, "environment": "sandbox", "status": "created"
            })
        return httpx.Response(200, json={
            "order_id": last_order[0], "payment_id": "pay_mockedprovider12345",
            "amount": "10.00", "payment_currency": "RUB",
            "status": "paid"  # GET may omit already attested sandbox markers
        })

    last_order = []
    def tracking_server(request):
        if request.method == "POST":
            import json
            last_order.append(json.loads(request.content)["order_id"])
        return server(request)

    with app_client(mode="provider", transport=httpx.MockTransport(tracking_server)) as client:
        obj = client.post("/sandbox/start", headers=headers()).json()
        assert obj["mode"] == "provider"
        assert obj["simulated"] is False
        assert obj["pay_url"].startswith("https://pay.rollypay.io/pay/")
        oid = obj["order_id"]
        assert client.post(f"/sandbox/{oid}/simulate", json={"status": "paid"},
                           headers=headers()).status_code == 403
        result = client.get(f"/sandbox/{oid}", headers=headers()).json()
        assert result["status"] == "paid" and result["vpn_delivered"] is False
        assert len(calls) == 2
        assert calls[0].headers["X-Nonce"] != calls[1].headers["X-Nonce"]


@pytest.mark.parametrize("status", [400, 401, 403, 422, 429, 500, 503])
def test_provider_error_code_does_not_read_or_repeat_sensitive_body(monkeypatch, status):
    monkeypatch.setenv("VAINAH_ALLOW_PROVIDER_TEST_ONLY", "enabled")
    secret = "private-upstream-data"
    def responder(request):
        return httpx.Response(status, text=secret)
    with app_client(mode="provider", transport=httpx.MockTransport(responder)) as client:
        response = client.post("/sandbox/start", headers=headers())
    assert response.status_code == 502
    assert response.json()["detail"] == "PROVIDER_HTTP_" + str(status)
    assert secret not in response.text


def test_real_provider_mode_requires_explicit_opt_in(monkeypatch):
    monkeypatch.delenv("VAINAH_ALLOW_PROVIDER_TEST_ONLY", raising=False)
    with pytest.raises(RuntimeError, match="explicit opt-in"):
        create_app(mode="provider", dev_token=TOKEN, api_key="some_key")


def test_provider_explicit_production_markers_or_unsafe_urls_rejected():
    good = {"test": True, "environment": "sandbox", "order_id": "sample",
            "payment_id": "pay_abcdef123456", "amount": "10.00",
            "payment_currency": "RUB", "status": "created"}
    assert validate_payment(good, "sample")[1] == "created"
    for updates in [
        {"test": False}, {"environment": "production"},
        {"amount": "11.00"}, {"payment_currency": "EUR"},
        {"payment_id": "production/injected"}
    ]:
        with pytest.raises(ProviderFailure):
            validate_payment({**good, **updates}, "sample")
    with pytest.raises(ProviderFailure):
        validate_payment({k: v for k, v in good.items() if k != "test"}, "sample")
    for bad in ["http://pay.rollypay.io/pay/abcde123", "https://evil.test/pay/tok_abcd123",
                "https://pay.rollypay.io/pay/tok_abc123?token=x",
                "https://pay.rollypay.io@evil.test/pay/tok_abc123"]:
        with pytest.raises(ProviderFailure):
            safe_pay_url(bad)

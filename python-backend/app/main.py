"""Vainah VPN local-only RollyPay sandbox prototype.

No Clerk, Netlify, H1Cloud, database, email or production billing writes.
Mock mode (default) NEVER calls RollyPay. Provider mode is opt-in and only
creates test:true invoices for an authorized merchant's existing terminal.
"""
from __future__ import annotations

import os
import re
import secrets
import uuid
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from threading import Lock
from typing import Literal
from urllib.parse import urlsplit

import httpx
import uvicorn
from fastapi import Depends, FastAPI, HTTPException
from fastapi.security import APIKeyHeader
from pydantic import BaseModel, ConfigDict

API = "https://rollypay.io/api/v1/payments"
AMOUNT = "10.00"                 # Demo amount only, never a purchase
CURRENCY = "RUB"
STATES = frozenset({"created", "processing", "paid", "canceled", "expired", "refunded", "chargeback"})
PAYMENT_ID = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{5,127}$")
PAY_URL_PATH = re.compile(r"^/pay/[A-Za-z0-9][A-Za-z0-9_-]{5,255}/?$")
ORDER_ID = re.compile(r"^vainah_py_sbx_[0-9a-f]{32}$")


class ProviderFailure(Exception):
    """A bounded diagnostic category; never includes provider response bodies."""
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


def valid_amount(value: object) -> bool:
    if not isinstance(value, (str, int, float)) or isinstance(value, bool):
        return False
    try:
        return Decimal(str(value)) == Decimal(AMOUNT)
    except InvalidOperation:
        return False


def safe_pay_url(value: object) -> str:
    if not isinstance(value, str) or len(value) > 2048:
        raise ProviderFailure("PROVIDER_PAY_URL_INVALID")
    try:
        url = urlsplit(value)
        if (url.scheme != "https" or url.netloc != "pay.rollypay.io" or
            url.query or url.fragment or not PAY_URL_PATH.fullmatch(url.path)):
            raise ValueError("disallowed address")
        return value
    except (ValueError, TypeError) as exc:
        raise ProviderFailure("PROVIDER_PAY_URL_INVALID") from exc


def validate_payment(data: object, order_id: str, payment_id: str | None = None,
                     confirmed_at_creation: bool = False) -> tuple[str, str]:
    """Never accept an explicit production marker. Creation requires BOTH markers.

    RollyPay GET may omit sandbox markers; then only an already confirmed local
    creation and unchanged provider identity/amount/order can be used for a
    sandbox status read. This never issues VPN or marks a real purchase paid.
    """
    if not isinstance(data, dict):
        raise ProviderFailure("PROVIDER_RESPONSE_INVALID")
    if data.get("test", object()) is not True:
        if not (confirmed_at_creation and "test" not in data):
            raise ProviderFailure("PROVIDER_SANDBOX_NOT_CONFIRMED")
    if data.get("environment", object()) != "sandbox":
        if not (confirmed_at_creation and "environment" not in data):
            raise ProviderFailure("PROVIDER_SANDBOX_NOT_CONFIRMED")
    if data.get("order_id") != order_id:
        raise ProviderFailure("PROVIDER_ORDER_MISMATCH")
    if not valid_amount(data.get("amount")) or data.get("payment_currency") != CURRENCY:
        raise ProviderFailure("PROVIDER_AMOUNT_OR_CURRENCY_MISMATCH")
    pid = data.get("payment_id")
    if not isinstance(pid, str) or not PAYMENT_ID.fullmatch(pid) or (
        payment_id is not None and payment_id != pid
    ):
        raise ProviderFailure("PROVIDER_PAYMENT_ID_MISMATCH")
    status = data.get("status")
    if status not in STATES:
        raise ProviderFailure("PROVIDER_STATUS_INVALID")
    return pid, status


@dataclass
class TestOrder:
    order_id: str
    payment_id: str
    mode: str
    status: str = "created"
    pay_url: str | None = None
    confirmed_sandbox: bool = False


class SimulateBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: Literal["paid", "canceled"]


class SandboxBackend:
    def __init__(self, mode: str, api_key: str | None, transport: httpx.AsyncBaseTransport | None):
        self.mode = mode
        self.api_key = api_key
        self.transport = transport
        self.orders: dict[str, TestOrder] = {}
        self.lock = Lock()

    def _get_order(self, order_id: str) -> TestOrder:
        if not ORDER_ID.fullmatch(order_id):
            raise HTTPException(status_code=404, detail="TEST_ORDER_NOT_FOUND")
        with self.lock:
            order = self.orders.get(order_id)
        if order is None:
            raise HTTPException(status_code=404, detail="TEST_ORDER_NOT_FOUND")
        return order

    async def _provider(self, method: str, path: str = "", json_body: dict | None = None) -> dict:
        if not self.api_key:
            raise ProviderFailure("PROVIDER_NOT_CONFIGURED")
        headers = {"X-API-Key": self.api_key, "X-Nonce": str(uuid.uuid4()),
                   "Accept": "application/json"}
        try:
            async with httpx.AsyncClient(transport=self.transport,
                                         follow_redirects=False, timeout=9.0) as client:
                response = await client.request(method, API + path, headers=headers,
                                                json=json_body)
        except httpx.TimeoutException as exc:
            raise ProviderFailure("PROVIDER_TIMEOUT") from exc
        except httpx.RequestError as exc:
            raise ProviderFailure("PROVIDER_NETWORK_ERROR") from exc
        if not (200 <= response.status_code <= 299):
            # Never inspect or log rejected bodies. No credentials or provider PII.
            if response.status_code in {400, 401, 402, 403, 404, 409, 422, 429, 500, 502, 503, 504}:
                raise ProviderFailure("PROVIDER_HTTP_" + str(response.status_code))
            raise ProviderFailure("PROVIDER_HTTP_OTHER")
        if len(response.content) > 65536:
            raise ProviderFailure("PROVIDER_RESPONSE_TOO_LARGE")
        try:
            data = response.json()
        except ValueError as exc:
            raise ProviderFailure("PROVIDER_RESPONSE_INVALID") from exc
        if not isinstance(data, dict):
            raise ProviderFailure("PROVIDER_RESPONSE_INVALID")
        return data

    async def start(self) -> dict:
        order_id = "vainah_py_sbx_" + uuid.uuid4().hex
        if self.mode == "mock":
            payment_id = "mock_" + uuid.uuid4().hex
            order = TestOrder(order_id, payment_id, "mock")
        else:
            # No client-supplied amount/method/merchant ID. NEVER test:false.
            data = await self._provider("POST", json_body={
                "order_id": order_id, "amount": AMOUNT, "payment_currency": CURRENCY,
                "description": "Vainah VPN — SANDBOX ONLY, no VPN delivery",
                "test": True
            })
            payment_id, status = validate_payment(data, order_id)
            pay_url = safe_pay_url(data.get("pay_url"))
            order = TestOrder(order_id, payment_id, "provider", status, pay_url, True)
        with self.lock:
            self.orders[order_id] = order
        return self.to_dict(order)

    async def status(self, order_id: str) -> dict:
        order = self._get_order(order_id)
        if order.mode == "provider":
            data = await self._provider("GET", "/" + order.payment_id)
            _, status = validate_payment(data, order_id, order.payment_id,
                                         confirmed_at_creation=order.confirmed_sandbox)
            with self.lock:
                order.status = status
        return self.to_dict(order)

    def simulate(self, order_id: str, status: str) -> dict:
        order = self._get_order(order_id)
        if order.mode != "mock":
            raise HTTPException(status_code=403, detail="PROVIDER_SIMULATION_FORBIDDEN")
        with self.lock:
            if order.status == "created":
                order.status = status
            elif order.status != status:
                raise HTTPException(status_code=409, detail="TEST_ORDER_ALREADY_FINISHED")
        return self.to_dict(order)

    @staticmethod
    def to_dict(order: TestOrder) -> dict:
        return {"order_id": order.order_id, "status": order.status,
                "mode": order.mode, "amount_rub": AMOUNT,
                "simulated": order.mode == "mock", "test_only": True,
                "real_money_charged": False, "vpn_delivered": False,
                "pay_url": order.pay_url}


def create_app(*, mode: str | None = None, dev_token: str | None = None,
               api_key: str | None = None,
               transport: httpx.AsyncBaseTransport | None = None) -> FastAPI:
    mode = mode or os.environ.get("VAINAH_SANDBOX_MODE", "mock")
    if mode not in {"mock", "provider"}:
        raise RuntimeError("VAINAH_SANDBOX_MODE must be mock or provider")
    token = dev_token or os.environ.get("VAINAH_LOCAL_DEV_TOKEN") or secrets.token_urlsafe(32)
    if len(token) < 24:
        raise RuntimeError("VAINAH_LOCAL_DEV_TOKEN must be at least 24 characters")
    api_key = api_key or os.environ.get("ROLLYPAY_API_KEY")
    if mode == "provider" and (
        os.environ.get("VAINAH_ALLOW_PROVIDER_TEST_ONLY") != "enabled" or not api_key
    ):
        raise RuntimeError("Provider sandbox mode requires explicit opt-in and an approved terminal")
    service = SandboxBackend(mode, api_key, transport)
    app = FastAPI(title="Vainah VPN — локальные тесты RollyPay", version="0.1.0",
                  description="Только тесты. Нет настоящих списаний или выдачи VPN.")
    app.state.backend = service
    app.state.dev_token = token
    key_scheme = APIKeyHeader(name="X-Dev-Token", auto_error=False)

    def require_local_token(key: str | None = Depends(key_scheme)) -> None:
        if not isinstance(key, str) or not secrets.compare_digest(key, token):
            raise HTTPException(status_code=401, detail="LOCAL_TEST_TOKEN_REQUIRED")

    def safe_call_error(exc: ProviderFailure) -> HTTPException:
        # Only bounded codes ever reach user. Provider bodies are not read on errors.
        return HTTPException(status_code=502, detail=exc.code)

    @app.get("/health")
    def health() -> dict:
        return {"ok": True, "mode": mode, "local_only": True,
                "payment_processing_enabled": False}

    @app.post("/sandbox/start", dependencies=[Depends(require_local_token)])
    async def start() -> dict:
        try:
            return await service.start()
        except ProviderFailure as exc:
            raise safe_call_error(exc) from None

    @app.get("/sandbox/{order_id}", dependencies=[Depends(require_local_token)])
    async def status(order_id: str) -> dict:
        try:
            return await service.status(order_id)
        except ProviderFailure as exc:
            raise safe_call_error(exc) from None

    @app.post("/sandbox/{order_id}/simulate", dependencies=[Depends(require_local_token)])
    def simulate(order_id: str, payload: SimulateBody) -> dict:
        return service.simulate(order_id, payload.status)

    return app


app = create_app()

if __name__ == "__main__":
    print("\nVainah VPN Python sandbox — local machine only", flush=True)
    print("Swagger: http://127.0.0.1:8765/docs", flush=True)
    print("Use the Authorize button with X-Dev-Token.", flush=True)
    print("Local test token:", app.state.dev_token, flush=True)
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="warning")

"""Client serveur Mosagix Pay et vérification des webhooks signés."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote, urlparse

import httpx

from app.config import settings


@dataclass
class MosagixError(Exception):
    message: str
    status_code: int = 502
    code: str = "MOSAGIX_ERROR"
    field_errors: dict[str, Any] | None = None

    def __str__(self) -> str:
        return self.message


def _require_server_config(*, webhook: bool = False) -> None:
    missing = []
    if not settings.MOSAGIX_API_URL:
        missing.append("MOSAGIX_API_URL")
    if not settings.MOSAGIX_API_KEY and not webhook:
        missing.append("MOSAGIX_API_KEY")
    if webhook and not settings.MOSAGIX_WEBHOOK_SECRET:
        missing.append("MOSAGIX_WEBHOOK_SECRET")
    if missing:
        raise MosagixError(
            "Mosagix Pay n'est pas encore configuré.",
            status_code=503,
            code="MOSAGIX_NOT_CONFIGURED",
            field_errors={"missing": missing},
        )
    if settings.APP_ENV.lower() in {"production", "prod"} and urlparse(_base_url()).scheme != "https":
        raise MosagixError(
            "MOSAGIX_API_URL doit utiliser HTTPS en production.",
            status_code=503,
            code="MOSAGIX_INSECURE_CONFIG",
        )


def _base_url() -> str:
    return settings.MOSAGIX_API_URL.rstrip("/")


async def _read_json(response: httpx.Response) -> dict[str, Any]:
    try:
        payload = response.json()
    except ValueError as exc:
        raise MosagixError(
            "Mosagix Pay a retourné une réponse invalide.",
            status_code=502,
            code="MOSAGIX_INVALID_RESPONSE",
        ) from exc
    return payload if isinstance(payload, dict) else {}


async def get_status() -> dict[str, Any]:
    _require_server_config()
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(f"{_base_url()}/api/v1/status")
    except httpx.RequestError as exc:
        raise MosagixError(
            "Le service de paiement est momentanément injoignable.",
            status_code=503,
            code="MOSAGIX_UNREACHABLE",
        ) from exc

    payload = await _read_json(response)
    if not response.is_success or not payload.get("success"):
        raise _error_from_response(response, payload)
    return payload.get("data") or {}


async def create_checkout(body: dict[str, Any], idempotency_key: str) -> dict[str, Any]:
    _require_server_config()
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(
                f"{_base_url()}/api/v1/checkout",
                headers={
                    "Content-Type": "application/json",
                    "X-Mosagix-Key": settings.MOSAGIX_API_KEY,
                    "Idempotency-Key": idempotency_key,
                },
                json=body,
            )
    except httpx.RequestError as exc:
        raise MosagixError(
            "Impossible d'ouvrir le paiement pour le moment. Veuillez réessayer.",
            status_code=503,
            code="MOSAGIX_UNREACHABLE",
        ) from exc

    payload = await _read_json(response)
    if response.status_code != 201 and not response.is_success:
        raise _error_from_response(response, payload)
    if not payload.get("success") or not isinstance(payload.get("data"), dict):
        raise _error_from_response(response, payload)
    return payload["data"]


async def get_payment(identifier: str) -> dict[str, Any]:
    _require_server_config()
    safe_identifier = quote(identifier, safe="")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(
                f"{_base_url()}/api/v1/payments/{safe_identifier}",
                headers={"X-Mosagix-Key": settings.MOSAGIX_API_KEY},
            )
    except httpx.RequestError as exc:
        raise MosagixError(
            "La vérification du paiement est momentanément indisponible.",
            status_code=503,
            code="MOSAGIX_UNREACHABLE",
        ) from exc

    payload = await _read_json(response)
    if not response.is_success or not payload.get("success"):
        raise _error_from_response(response, payload)
    return payload.get("data") or {}


def verify_webhook(raw_body: bytes, signature_header: str | None) -> bool:
    try:
        _require_server_config(webhook=True)
    except MosagixError:
        return False
    if not signature_header or not signature_header.startswith("v1:"):
        return False
    provided = signature_header[3:]
    if len(provided) != 64:
        return False
    try:
        int(provided, 16)
    except ValueError:
        return False
    expected = hmac.new(
        settings.MOSAGIX_WEBHOOK_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(provided.lower(), expected)


def public_frontend_url() -> str:
    return (settings.APP_PUBLIC_FRONTEND_URL or settings.FRONTEND_URL).rstrip("/")


def _error_from_response(response: httpx.Response, payload: dict[str, Any]) -> MosagixError:
    upstream_status = response.status_code
    safe_status = upstream_status if upstream_status in {400, 401, 403, 429, 503} else 502
    return MosagixError(
        message=str(payload.get("message") or "Le paiement Mosagix n'a pas pu être initialisé."),
        status_code=safe_status,
        code=str(payload.get("code") or "MOSAGIX_ERROR"),
        field_errors=payload.get("fieldErrors") if isinstance(payload.get("fieldErrors"), dict) else None,
    )

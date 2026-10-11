"""Paiements d'abonnement via Mosagix Pay uniquement."""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from urllib.parse import urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request
from sqlalchemy import or_, select

from app.config import settings
from app.core.deps import CurrentUser, DB
from app.models.content import PricingPlan
from app.models.subscription import Invoice, MosagixPayment, Subscription
from app.schemas.subscription import (
    MosagixCheckoutOut,
    MosagixCheckoutRequest,
    MosagixConfirmOut,
    MosagixConfirmRequest,
    MosagixStatusOut,
)
from app.services import invoice as invoice_service, mosagix_pay

router = APIRouter(prefix="/billing", tags=["Billing"])
webhook_router = APIRouter(prefix="/webhooks", tags=["Webhooks"])

SUCCESS_PATH = "/dashboard/subscription/payment/success"
CANCEL_PATH = "/dashboard/subscription/payment/cancel"
ALLOWED_METHODS = ["OM", "MOMO", "PAYCARD", "CARD"]
logger = logging.getLogger(__name__)


def _http_error(exc: mosagix_pay.MosagixError) -> HTTPException:
    detail: dict[str, object] = {"message": exc.message, "code": exc.code}
    if exc.field_errors:
        detail["fieldErrors"] = exc.field_errors
    return HTTPException(status_code=exc.status_code, detail=detail)


def _plan_amount(plan: PricingPlan) -> int:
    try:
        amount = Decimal(plan.price)
    except (InvalidOperation, TypeError) as exc:
        raise HTTPException(status_code=400, detail="Ce plan ne peut pas être payé en ligne.") from exc
    if amount <= 0 or amount != amount.to_integral_value():
        raise HTTPException(status_code=400, detail="Le montant du plan doit être un entier positif.")
    return int(amount)


def _checkout_url_is_trusted(checkout_url: str) -> bool:
    checkout = urlparse(checkout_url)
    api = urlparse(settings.MOSAGIX_API_URL)
    return checkout.scheme in {"http", "https"} and bool(checkout.hostname) and checkout.hostname == api.hostname


async def _find_local_payment(db, identifier: str, user_id=None, *, lock: bool = False):
    stmt = select(MosagixPayment).where(
        or_(
            MosagixPayment.payment_id == identifier,
            MosagixPayment.merchant_reference == identifier,
        )
    )
    if user_id is not None:
        stmt = stmt.where(MosagixPayment.user_id == user_id)
    if lock:
        stmt = stmt.with_for_update()
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def _fulfill(db, payment: MosagixPayment, remote: dict) -> bool:
    """Active exactement une fois l'abonnement correspondant au paiement local."""
    if payment.status == "success" and payment.subscription_id:
        return True

    remote_status = str(remote.get("status") or "").upper()
    remote_reference = str(remote.get("merchantPaymentReference") or "")
    remote_currency = str(remote.get("currency") or "").upper()
    try:
        remote_amount = Decimal(str(remote.get("amount")))
        paid_amount_raw = remote.get("paidAmount")
        paid_amount = Decimal(str(paid_amount_raw)) if paid_amount_raw is not None else remote_amount
    except (InvalidOperation, TypeError):
        payment.failure_reason = "Réponse Mosagix invalide: montant absent ou incorrect."
        return False

    expected_amount = Decimal(str(payment.amount))
    if (
        remote_status != "SUCCESS"
        or remote_reference != payment.merchant_reference
        or remote_currency != payment.currency
        or remote_amount != expected_amount
        or paid_amount < expected_amount
    ):
        payment.failure_reason = "La confirmation Mosagix ne correspond pas à la tentative locale."
        return False

    active_result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == payment.user_id,
            Subscription.status == "active",
        ).with_for_update()
    )
    for old_subscription in active_result.scalars().all():
        old_subscription.status = "cancelled"

    subscription = Subscription(
        user_id=payment.user_id,
        plan_id=payment.plan_id,
        status="active",
        payment_method=f"Mosagix Pay — {remote.get('paymentMethod') or 'Paiement en ligne'}",
        renewal_date=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(subscription)
    await db.flush()

    invoice = Invoice(
        subscription_id=subscription.id,
        user_id=payment.user_id,
        plan_name=payment.plan_name,
        amount=payment.amount,
        description=f"Abonnement {payment.plan_name} — Mosagix Pay",
        status="paid",
    )
    db.add(invoice)
    await db.flush()
    await invoice_service.assign_number(db, invoice)

    payment.status = "success"
    if not payment.payment_id and remote.get("paymentId"):
        payment.payment_id = str(remote["paymentId"])
    payment.payment_method = str(remote.get("paymentMethod") or "") or None
    payment.transaction_id = str(remote.get("djomyTransactionId") or remote.get("transactionId") or "") or None
    payment.subscription_id = subscription.id
    payment.invoice_id = invoice.id
    payment.fulfilled_at = datetime.now(timezone.utc)
    payment.failure_reason = None
    return True


@router.get("/status", response_model=MosagixStatusOut)
async def payment_status(current_user: CurrentUser):
    """Expose uniquement la disponibilité publique de Mosagix, jamais les secrets."""
    del current_user
    try:
        data = await mosagix_pay.get_status()
    except mosagix_pay.MosagixError as exc:
        raise _http_error(exc) from exc
    return MosagixStatusOut(
        available=data.get("available") is True,
        message=data.get("message"),
        sandbox=data.get("sandbox") is True,
    )


@router.post("/checkout", response_model=MosagixCheckoutOut, status_code=201)
async def checkout(body: MosagixCheckoutRequest, current_user: CurrentUser, db: DB):
    plan_result = await db.execute(
        select(PricingPlan).where(
            PricingPlan.plan_id == body.plan_id,
            PricingPlan.is_active == True,  # noqa: E712
        )
    )
    plan = plan_result.scalar_one_or_none()
    if not plan or plan.plan_id == "gratuit" or plan.cta_type == "contact":
        raise HTTPException(status_code=400, detail="Ce plan n'est pas disponible au paiement en ligne.")
    amount = _plan_amount(plan)

    try:
        availability = await mosagix_pay.get_status()
    except mosagix_pay.MosagixError as exc:
        raise _http_error(exc) from exc
    if availability.get("available") is not True:
        raise HTTPException(
            status_code=503,
            detail={
                "message": availability.get("message") or "Paiements temporairement indisponibles.",
                "code": "MOSAGIX_UNAVAILABLE",
            },
        )

    reuse_after = datetime.now(timezone.utc) - timedelta(minutes=20)
    reusable_result = await db.execute(
        select(MosagixPayment)
        .where(
            MosagixPayment.user_id == current_user.id,
            MosagixPayment.plan_id == plan.plan_id,
            MosagixPayment.status.in_(["checkout_pending", "created"]),
            MosagixPayment.created_at >= reuse_after,
        )
        .order_by(MosagixPayment.created_at.desc())
    )
    payment = reusable_result.scalars().first()
    if not payment:
        reference = f"JST-{datetime.now(timezone.utc):%Y%m%d}-{uuid.uuid4().hex[:16].upper()}"
        payment = MosagixPayment(
            user_id=current_user.id,
            plan_id=plan.plan_id,
            plan_name=plan.name,
            amount=amount,
            currency="GNF",
            merchant_reference=reference,
            status="checkout_pending",
        )
        db.add(payment)
        await db.commit()
        await db.refresh(payment)

    if not payment.checkout_url:
        frontend_url = mosagix_pay.public_frontend_url()
        if settings.APP_ENV.lower() in {"production", "prod"} and urlparse(frontend_url).scheme != "https":
            raise HTTPException(
                status_code=503,
                detail={"message": "APP_PUBLIC_FRONTEND_URL doit utiliser HTTPS en production.", "code": "MOSAGIX_INSECURE_CONFIG"},
            )
        try:
            session = await mosagix_pay.create_checkout(
                {
                    "amount": amount,
                    "countryCode": "GN",
                    "currency": "GNF",
                    "payerNumber": body.payer_number,
                    "payerName": current_user.name,
                    "payerEmail": current_user.email,
                    "description": f"Abonnement JusticIA {plan.name}",
                    "merchantPaymentReference": payment.merchant_reference,
                    "successUrl": f"{frontend_url}{SUCCESS_PATH}",
                    "cancelUrl": f"{frontend_url}{CANCEL_PATH}",
                    "metadata": {
                        "user_id": str(current_user.id),
                        "plan": plan.plan_id,
                    },
                    "allowedPaymentMethods": ALLOWED_METHODS,
                },
                idempotency_key=payment.merchant_reference,
            )
        except mosagix_pay.MosagixError as exc:
            if exc.code != "MOSAGIX_UNREACHABLE":
                payment.status = "checkout_failed"
                payment.failure_reason = exc.message
                await db.commit()
            raise _http_error(exc) from exc

        checkout_url = str(session.get("checkoutUrl") or "")
        payment_id = str(session.get("paymentId") or "")
        if not checkout_url or not payment_id or not _checkout_url_is_trusted(checkout_url):
            payment.status = "checkout_failed"
            payment.failure_reason = "Réponse de checkout Mosagix incomplète ou non fiable."
            await db.commit()
            raise HTTPException(status_code=502, detail="Réponse de paiement invalide.")

        payment.payment_id = payment_id
        payment.checkout_token = str(session.get("checkoutToken") or "") or None
        payment.checkout_url = checkout_url
        payment.status = "created"
        await db.commit()
        await db.refresh(payment)

    return MosagixCheckoutOut(
        payment_id=payment.payment_id or "",
        merchant_reference=payment.merchant_reference,
        checkout_url=payment.checkout_url or "",
        status=payment.status,
        amount=int(payment.amount),
        currency=payment.currency,
    )


@router.post("/confirm", response_model=MosagixConfirmOut)
async def confirm_payment(body: MosagixConfirmRequest, current_user: CurrentUser, db: DB,
                          background: BackgroundTasks):
    payment = await _find_local_payment(db, body.payment_id, current_user.id)
    if not payment:
        raise HTTPException(status_code=404, detail="Paiement introuvable.")
    if payment.status == "success" and payment.subscription_id:
        return MosagixConfirmOut(status="success", fulfilled=True, message="Abonnement déjà activé.")

    lookup_id = payment.payment_id or payment.merchant_reference
    try:
        remote = await mosagix_pay.get_payment(lookup_id)
    except mosagix_pay.MosagixError as exc:
        raise _http_error(exc) from exc

    payment = await _find_local_payment(db, body.payment_id, current_user.id, lock=True)
    fulfilled = await _fulfill(db, payment, remote)
    if not fulfilled:
        remote_status = str(remote.get("status") or "PENDING").lower()
        if remote_status in {"failed", "cancelled", "timeout"}:
            payment.status = remote_status
        await db.commit()
        return MosagixConfirmOut(
            status=remote_status,
            fulfilled=False,
            message="Paiement en cours de confirmation." if remote_status not in {"failed", "cancelled", "timeout"} else "Le paiement n'a pas abouti.",
        )

    await db.commit()
    if payment.invoice_id:
        background.add_task(invoice_service.send_invoice_email, payment.invoice_id)
    return MosagixConfirmOut(status="success", fulfilled=True, message="Paiement confirmé et abonnement activé.")


@webhook_router.post("/mosagix")
async def mosagix_webhook(request: Request, db: DB, background: BackgroundTasks):
    raw_body = await request.body()
    signature = request.headers.get("X-Mosagix-Signature")
    if not mosagix_pay.verify_webhook(raw_body, signature):
        raise HTTPException(status_code=401, detail="Signature Mosagix invalide.")

    try:
        payload = json.loads(raw_body)
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise HTTPException(status_code=400, detail="Payload Mosagix invalide.") from exc
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Payload Mosagix invalide.")

    event_type = str(payload.get("eventType") or "")
    header_event = request.headers.get("X-Mosagix-Event")
    if header_event and header_event != event_type:
        raise HTTPException(status_code=400, detail="Type d'événement Mosagix incohérent.")

    identifier = str(payload.get("paymentId") or payload.get("merchantPaymentReference") or "")
    if not identifier:
        raise HTTPException(status_code=400, detail="Identifiant Mosagix absent.")
    payment = await _find_local_payment(db, identifier, lock=True)
    merchant_reference = str(payload.get("merchantPaymentReference") or "")
    if not payment and merchant_reference and merchant_reference != identifier:
        # Couvre le cas rare où Mosagix a créé la session mais où sa réponse au
        # checkout a été perdue avant l'enregistrement local du paymentId.
        payment = await _find_local_payment(db, merchant_reference, lock=True)
    if not payment:
        # Réponse 200 pour éviter des retries sans fin sur une référence étrangère.
        logger.warning(
            "Webhook Mosagix ignoré: paiement local introuvable (reference=%s, delivery=%s)",
            merchant_reference or identifier,
            request.headers.get("X-Mosagix-Delivery"),
        )
        return {"success": True, "ignored": True}

    payment.last_delivery_id = request.headers.get("X-Mosagix-Delivery")
    if event_type == "payment.success":
        fulfilled = await _fulfill(db, payment, payload)
        await db.commit()
        if not fulfilled:
            logger.error(
                "Webhook Mosagix incohérent (reference=%s, delivery=%s)",
                payment.merchant_reference,
                payment.last_delivery_id,
            )
            raise HTTPException(status_code=409, detail="Confirmation Mosagix incohérente.")
        if payment.invoice_id:
            background.add_task(invoice_service.send_invoice_email, payment.invoice_id)
        return {"success": True, "fulfilled": True}

    terminal_statuses = {
        "payment.failed": "failed",
        "payment.cancelled": "cancelled",
        "payment.timeout": "timeout",
    }
    if event_type in terminal_statuses and payment.status != "success":
        payment.status = terminal_statuses[event_type]
        payment.failure_reason = str(payload.get("message") or event_type)
    await db.commit()
    return {"success": True, "fulfilled": False}

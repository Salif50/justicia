"""
Routes d'abonnement JusticIA.
Les plans sont lus depuis la table `pricing_plans` (gérée par l'admin),
pas depuis un dict hardcodé.
"""
from datetime import date

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.models.content import PricingPlan
from app.models.subscription import Invoice, Subscription
from app.models.user import UserStats
from app.services.quota import resolve_quota
from app.schemas.subscription import (FREE_DAILY_LIMIT, InvoiceOut,
                                       SubscriptionOut, UsageOut)
from app.schemas.content import PricingPlanOut

router = APIRouter(prefix="/subscription", tags=["Subscription"])


# ── Helpers ───────────────────────────────────────────────────────────────────
async def _get_plan_by_id(plan_id: str, db) -> PricingPlan | None:
    """Recherche un plan actif par son slug (plan_id)."""
    result = await db.execute(
        select(PricingPlan).where(
            PricingPlan.plan_id == plan_id,
            PricingPlan.is_active == True,  # noqa: E712
        )
    )
    return result.scalar_one_or_none()


def _build_sub_out(sub: Subscription, plan: PricingPlan | None) -> SubscriptionOut:
    import json
    features = []
    if plan and plan.features:
        try:
            features = json.loads(plan.features)
        except Exception:
            features = []

    price_int = 0
    if plan:
        try:
            price_int = int(plan.price)
        except (ValueError, TypeError):
            price_int = 0

    return SubscriptionOut(
        id=str(sub.id),
        plan_id=sub.plan_id,
        name=plan.name if plan else sub.plan_id,
        price=price_int,
        period=plan.period if plan else "mois",
        features=features,
        status=sub.status,
        renewal_date=sub.renewal_date,
        payment_method=sub.payment_method,
    )


# ── GET /plans ────────────────────────────────────────────────────────────────
@router.get("/plans", response_model=list[PricingPlanOut])
async def get_plans(db: DB):
    """Retourne les plans tarifaires actifs définis par l'admin."""
    result = await db.execute(
        select(PricingPlan)
        .where(PricingPlan.is_active == True)  # noqa: E712
        .order_by(PricingPlan.order.asc())
    )
    plans = result.scalars().all()

    # Exclure le plan "gratuit" (tier 0) de la liste d'abonnement payant
    # car il représente l'état sans abonnement
    return [PricingPlanOut.model_validate(p) for p in plans if p.plan_id != "gratuit"]


# ── GET /current ──────────────────────────────────────────────────────────────
@router.get("/current", response_model=SubscriptionOut | None)
async def get_current(current_user: CurrentUser, db: DB):
    """Retourne l'abonnement actif de l'utilisateur."""
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == current_user.id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
    )
    sub = result.scalars().first()
    if not sub:
        return None

    plan = await _get_plan_by_id(sub.plan_id, db)
    return _build_sub_out(sub, plan)


# ── GET /usage ────────────────────────────────────────────────────────────────
@router.get("/usage", response_model=UsageOut)
async def get_usage(current_user: CurrentUser, db: DB):
    """Retourne le quota journalier de l'utilisateur (plan + éventuel quota personnalisé)."""
    quota = await resolve_quota(current_user, db)
    return UsageOut(
        plan_id=quota.plan_id,
        plan_name=quota.plan_name,
        daily_limit=quota.daily_limit,
        questions_today=quota.questions_today,
        remaining=quota.remaining,
        is_unlimited=quota.is_unlimited,
        is_free_tier=quota.is_free_tier,
    )


# L'ancien endpoint /upgrade activait un abonnement sans preuve de paiement.
# Toute souscription payante passe désormais par POST /billing/checkout.


# ── POST /cancel ──────────────────────────────────────────────────────────────
@router.post("/cancel")
async def cancel(current_user: CurrentUser, db: DB):
    """Annule l'abonnement actif."""
    result = await db.execute(
        select(Subscription).where(
            Subscription.user_id == current_user.id,
            Subscription.status == "active",
        )
    )
    sub = result.scalars().first()
    if not sub:
        raise HTTPException(status_code=404, detail="Aucun abonnement actif.")
    sub.status = "cancelled"
    await db.commit()
    return {"success": True, "message": "Abonnement annulé."}


# ── GET /invoices ─────────────────────────────────────────────────────────────
@router.get("/invoices", response_model=list[InvoiceOut])
async def get_invoices(current_user: CurrentUser, db: DB):
    """Retourne l'historique de facturation."""
    result = await db.execute(
        select(Invoice)
        .where(Invoice.user_id == current_user.id)
        .order_by(Invoice.created_at.desc())
    )
    return [
        InvoiceOut(
            id=str(i.id),
            number=i.number,
            date=i.created_at,
            plan_name=i.plan_name,
            description=i.description,
            amount=float(i.amount),
            status=i.status,
        )
        for i in result.scalars().all()
    ]


# ── GET /invoices/{id}/pdf ────────────────────────────────────────────────────
@router.get("/invoices/{invoice_id}/pdf")
async def download_invoice(invoice_id: str, current_user: CurrentUser, db: DB):
    """Facture PDF (uniquement celles de l'utilisateur connecté)."""
    import uuid as _uuid

    from fastapi import HTTPException
    from fastapi.responses import Response

    from app.services import invoice as invoice_service

    try:
        iid = _uuid.UUID(invoice_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    loaded = await invoice_service.load_invoice(db, iid)
    if not loaded or loaded[0].user_id != current_user.id:
        raise HTTPException(status_code=404, detail="Facture introuvable.")
    invoice, user, payment = loaded
    if not invoice.number:
        await invoice_service.assign_number(db, invoice)
        await db.commit()
    pdf = invoice_service.build_pdf(invoice, user, payment)
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="facture-{invoice.number}.pdf"'},
    )

"""
Endpoints publics — aucune authentification requise.
Sert les données dynamiques aux pages publiques du frontend.
"""
import json
from typing import Optional

from fastapi import APIRouter
from sqlalchemy import select

from app.core.deps import DB
from app.models.content import FaqItem, Partner, PricingPlan, SiteConfig, Testimonial
from app.schemas.content import (FaqItemOut, PartnerOut, PricingPlanOut,
                                  SiteConfigOut, TestimonialOut)

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/testimonials", response_model=list[TestimonialOut])
async def get_testimonials(db: DB):
    result = await db.execute(
        select(Testimonial)
        .where(Testimonial.is_active == True)
        .order_by(Testimonial.order, Testimonial.id)
    )
    return result.scalars().all()


@router.get("/pricing", response_model=list[PricingPlanOut])
async def get_pricing(db: DB):
    result = await db.execute(
        select(PricingPlan)
        .where(PricingPlan.is_active == True)
        .order_by(PricingPlan.order, PricingPlan.id)
    )
    return result.scalars().all()


@router.get("/faq", response_model=list[FaqItemOut])
async def get_faq(category: Optional[str] = None, db: DB = None):
    q = select(FaqItem).where(FaqItem.is_active == True)
    if category:
        q = q.where(FaqItem.category == category)
    result = await db.execute(q.order_by(FaqItem.category, FaqItem.order, FaqItem.id))
    return result.scalars().all()


@router.get("/partners", response_model=list[PartnerOut])
async def get_partners(db: DB):
    result = await db.execute(
        select(Partner)
        .where(Partner.is_active == True)
        .order_by(Partner.order, Partner.id)
    )
    return result.scalars().all()


@router.get("/config", response_model=dict)
async def get_config(db: DB):
    """Retourne toute la configuration du site sous forme de dict key→value."""
    result = await db.execute(select(SiteConfig))
    rows = result.scalars().all()
    return {
        row.key: json.loads(row.value) if _is_json(row.value) else row.value
        for row in rows
    }


def _is_json(value: str) -> bool:
    try:
        json.loads(value)
        return True
    except Exception:
        return False

import json
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


# ── Testimonial ───────────────────────────────────────────────────────────────

class TestimonialOut(BaseModel):
    id: int
    name: str
    role: str
    text: str
    rating: int
    avatar_url: Optional[str]
    is_active: bool
    order: int
    model_config = {"from_attributes": True}


class TestimonialCreate(BaseModel):
    name: str
    role: str
    text: str
    rating: int = 5
    avatar_url: Optional[str] = None
    is_active: bool = True
    order: int = 0


class TestimonialUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    text: Optional[str] = None
    rating: Optional[int] = None
    avatar_url: Optional[str] = None
    is_active: Optional[bool] = None
    order: Optional[int] = None


# ── PricingPlan ───────────────────────────────────────────────────────────────

class PricingPlanOut(BaseModel):
    id: int
    plan_id: Optional[str] = None   # slug ("basic", "pro", …) — lie le plan à Subscription
    name: str
    price: str
    currency: str
    period: str
    description: str
    features: list[str]
    daily_limit: int = -1           # -1 = illimité
    is_popular: bool
    is_active: bool
    cta_text: str
    cta_type: str
    order: int
    model_config = {"from_attributes": True}

    @field_validator("features", mode="before")
    @classmethod
    def parse_features(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return []
        return v or []


class PricingPlanCreate(BaseModel):
    plan_id: Optional[str] = None
    name: str
    price: str
    currency: str = "FG"
    period: str = "mois"
    description: str
    features: list[str]
    daily_limit: int = -1
    is_popular: bool = False
    is_active: bool = True
    cta_text: str = "Choisir ce plan"
    cta_type: str = "link"
    order: int = 0


class PricingPlanUpdate(BaseModel):
    plan_id: Optional[str] = None
    name: Optional[str] = None
    price: Optional[str] = None
    currency: Optional[str] = None
    period: Optional[str] = None
    description: Optional[str] = None
    features: Optional[list[str]] = None
    daily_limit: Optional[int] = None
    is_popular: Optional[bool] = None
    is_active: Optional[bool] = None
    cta_text: Optional[str] = None
    cta_type: Optional[str] = None
    order: Optional[int] = None


# ── FaqItem ───────────────────────────────────────────────────────────────────

class FaqItemOut(BaseModel):
    id: int
    question: str
    answer: str
    category: str
    order: int
    is_active: bool
    model_config = {"from_attributes": True}


class FaqItemCreate(BaseModel):
    question: str
    answer: str
    category: str = "general"
    order: int = 0
    is_active: bool = True


class FaqItemUpdate(BaseModel):
    question: Optional[str] = None
    answer: Optional[str] = None
    category: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


# ── Partner ───────────────────────────────────────────────────────────────────

class PartnerOut(BaseModel):
    id: int
    name: str
    logo_url: Optional[str]
    order: int
    is_active: bool
    model_config = {"from_attributes": True}


class PartnerCreate(BaseModel):
    name: str
    logo_url: Optional[str] = None
    order: int = 0
    is_active: bool = True


class PartnerUpdate(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    order: Optional[int] = None
    is_active: Optional[bool] = None


# ── SiteConfig ────────────────────────────────────────────────────────────────

class SiteConfigOut(BaseModel):
    key: str
    value: Any         # désérialisé depuis JSON
    label: str
    model_config = {"from_attributes": True}

    @field_validator("value", mode="before")
    @classmethod
    def parse_value(cls, v: Any) -> Any:
        if isinstance(v, str):
            try:
                return json.loads(v)
            except Exception:
                return v
        return v


class SiteConfigUpdate(BaseModel):
    value: Any
    label: Optional[str] = None

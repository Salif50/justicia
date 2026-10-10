import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class Testimonial(Base):
    __tablename__ = "testimonials"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:       Mapped[str]      = mapped_column(String(150), nullable=False)
    role:       Mapped[str]      = mapped_column(String(150), nullable=False)
    text:       Mapped[str]      = mapped_column(Text, nullable=False)
    rating:     Mapped[int]      = mapped_column(Integer, default=5)          # 1-5
    avatar_url: Mapped[str|None] = mapped_column(String(500), nullable=True)
    is_active:  Mapped[bool]     = mapped_column(Boolean, default=True)
    order:      Mapped[int]      = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class PricingPlan(Base):
    __tablename__ = "pricing_plans"

    id:          Mapped[int]           = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Slug unique utilisé dans Subscription.plan_id ("basic", "pro", "enterprise", ...)
    plan_id:     Mapped[str | None]    = mapped_column(String(50), nullable=True, unique=True, index=True)
    name:        Mapped[str]           = mapped_column(String(100), nullable=False)
    price:       Mapped[str]           = mapped_column(String(50), nullable=False)   # "0", "50000", "Sur mesure"
    currency:    Mapped[str]           = mapped_column(String(10), default="FG")
    period:      Mapped[str]           = mapped_column(String(20), default="mois")   # "mois" | "an" | ""
    description: Mapped[str]           = mapped_column(String(255), nullable=False)
    features:    Mapped[str]           = mapped_column(Text, nullable=False)         # JSON array string
    # Limite journalière de questions : -1 = illimité
    daily_limit:   Mapped[int]         = mapped_column(Integer, default=-1)
    # JSON array of feature keys: ["unlimited_questions","custom_agents",...]
    feature_flags: Mapped[str]         = mapped_column(Text, nullable=False, default="[]")
    is_popular:    Mapped[bool]         = mapped_column(Boolean, default=False)
    is_active:   Mapped[bool]          = mapped_column(Boolean, default=True)
    cta_text:    Mapped[str]           = mapped_column(String(100), default="Choisir ce plan")
    cta_type:    Mapped[str]           = mapped_column(String(20), default="link")   # "link" | "contact"
    order:       Mapped[int]           = mapped_column(Integer, default=0)
    created_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:  Mapped[datetime]      = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class FaqItem(Base):
    __tablename__ = "faq_items"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    question:   Mapped[str]      = mapped_column(Text, nullable=False)
    answer:     Mapped[str]      = mapped_column(Text, nullable=False)
    category:   Mapped[str]      = mapped_column(String(50), default="general")  # "support" | "pricing" | "general"
    order:      Mapped[int]      = mapped_column(Integer, default=0)
    is_active:  Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Partner(Base):
    __tablename__ = "partners"

    id:         Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    name:       Mapped[str]      = mapped_column(String(150), nullable=False)
    logo_url:   Mapped[str|None] = mapped_column(String(500), nullable=True)
    order:      Mapped[int]      = mapped_column(Integer, default=0)
    is_active:  Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc)


class SiteConfig(Base):
    """Clé-valeur pour la configuration du site (stats, contact, etc.)."""
    __tablename__ = "site_config"

    key:        Mapped[str]      = mapped_column(String(100), primary_key=True)
    value:      Mapped[str]      = mapped_column(Text, nullable=False)   # JSON string
    label:      Mapped[str]      = mapped_column(String(200), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

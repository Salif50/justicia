import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class Subscription(Base):
    __tablename__ = "subscriptions"

    id:             Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:        Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    plan_id:        Mapped[str]       = mapped_column(String(30), nullable=False)   # basic | pro | enterprise
    status:         Mapped[str]       = mapped_column(String(20), default="active") # active | cancelled | expired
    payment_method: Mapped[str | None]= mapped_column(String(100), nullable=True)
    renewal_date:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:     Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:     Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user:     Mapped["User"]          = relationship("User",     back_populates="subscriptions")
    invoices: Mapped[list["Invoice"]] = relationship("Invoice",  back_populates="subscription", cascade="all, delete-orphan")


class Invoice(Base):
    __tablename__ = "invoices"

    id:              Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    subscription_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="CASCADE"), nullable=False)
    user_id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id",  ondelete="CASCADE"), nullable=False)
    plan_name:       Mapped[str]       = mapped_column(String(50), nullable=False)
    description:     Mapped[str | None]= mapped_column(Text, nullable=True)
    amount:          Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False)
    status:          Mapped[str]       = mapped_column(String(20), default="paid")  # paid | pending
    created_at:      Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)
    # Numéro légal séquentiel (JST-AAAA-000001), attribué au paiement
    number:          Mapped[str | None]      = mapped_column(String(32), nullable=True, unique=True)
    # Date d'envoi de la facture par e-mail (évite les doublons)
    emailed_at:      Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subscription: Mapped["Subscription"] = relationship("Subscription", back_populates="invoices")


class MosagixPayment(Base):
    """Tentative de paiement locale et source d'idempotence du fulfillment."""

    __tablename__ = "mosagix_payments"

    id:                 Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:            Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_id:            Mapped[str]       = mapped_column(String(50), nullable=False)
    plan_name:          Mapped[str]       = mapped_column(String(100), nullable=False)
    amount:             Mapped[float]     = mapped_column(Numeric(12, 2), nullable=False)
    currency:           Mapped[str]       = mapped_column(String(10), default="GNF", nullable=False)
    merchant_reference: Mapped[str]       = mapped_column(String(100), unique=True, nullable=False, index=True)
    payment_id:         Mapped[str | None]= mapped_column(String(120), unique=True, nullable=True, index=True)
    checkout_token:     Mapped[str | None]= mapped_column(String(255), nullable=True)
    checkout_url:       Mapped[str | None]= mapped_column(Text, nullable=True)
    status:             Mapped[str]       = mapped_column(String(30), default="checkout_pending", nullable=False, index=True)
    payment_method:     Mapped[str | None]= mapped_column(String(30), nullable=True)
    transaction_id:     Mapped[str | None]= mapped_column(String(150), nullable=True)
    subscription_id:    Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("subscriptions.id", ondelete="SET NULL"), nullable=True)
    invoice_id:         Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("invoices.id", ondelete="SET NULL"), nullable=True)
    last_delivery_id:   Mapped[str | None]= mapped_column(String(150), nullable=True)
    failure_reason:     Mapped[str | None]= mapped_column(Text, nullable=True)
    fulfilled_at:       Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at:         Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:         Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)


class Contact(Base):
    __tablename__ = "contacts"

    id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name:       Mapped[str]       = mapped_column(String(150), nullable=False)
    email:      Mapped[str]       = mapped_column(String(255), nullable=False)
    subject:    Mapped[str]       = mapped_column(String(255), nullable=False)
    message:    Mapped[str]       = mapped_column(Text, nullable=False)
    is_read:    Mapped[bool]      = mapped_column(default=False)
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)

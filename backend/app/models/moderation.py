from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now():
    return datetime.now(timezone.utc)


class ModerationRule(Base):
    """Règles de modération du contenu (blacklist, avertissement, blocage)."""
    __tablename__ = "moderation_rules"

    id:          Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    type:        Mapped[str]      = mapped_column(String(20), default="blacklist")  # blacklist | warning | block_user
    pattern:     Mapped[str]      = mapped_column(String(500), nullable=False)
    description: Mapped[str]      = mapped_column(String(300), default="")
    is_active:   Mapped[bool]     = mapped_column(Boolean, default=True)
    created_at:  Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    created_by:  Mapped[str]      = mapped_column(String(150), default="admin")


class AdminAuditLog(Base):
    """Journal des actions d'administration (qui a fait quoi, sur quel compte)."""
    __tablename__ = "admin_audit_logs"

    id:             Mapped[int]         = mapped_column(Integer, primary_key=True, autoincrement=True)
    admin_id:       Mapped[str]         = mapped_column(String(40), nullable=False)
    admin_email:    Mapped[str]         = mapped_column(String(255), nullable=False)
    target_user_id: Mapped[str | None]  = mapped_column(String(40), nullable=True, index=True)
    target_email:   Mapped[str | None]  = mapped_column(String(255), nullable=True)
    action:         Mapped[str]         = mapped_column(String(50), nullable=False)
    details:        Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at:     Mapped[datetime]    = mapped_column(DateTime(timezone=True), default=_now, index=True)

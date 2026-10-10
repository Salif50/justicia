import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class CustomAgent(Base):
    __tablename__ = "custom_agents"

    id:            Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:       Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name:          Mapped[str]       = mapped_column(String(150), nullable=False)
    description:   Mapped[str]       = mapped_column(Text, nullable=False, default="")
    # Prompt système définissant le comportement et le périmètre de l'agent
    system_prompt: Mapped[str]       = mapped_column(Text, nullable=False, default="")
    # IDs des documents sélectionnés dans metadata.json (ex: ["doc_008", "doc_006"])
    doc_ids:       Mapped[list]      = mapped_column(JSON, nullable=False, default=list)
    # Domaines juridiques déduits des documents (ex: ["Droit pénal", "Droit foncier"])
    domains:       Mapped[list]      = mapped_column(JSON, nullable=False, default=list)
    created_at:    Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:    Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="custom_agents")


class BuiltinAgentConfig(Base):
    """Permet à l'admin de surcharger le prompt système des agents intégrés."""
    __tablename__ = "builtin_agent_configs"

    agent_id:      Mapped[str]      = mapped_column(String(80), primary_key=True)
    system_prompt: Mapped[str]      = mapped_column(Text, nullable=False)
    updated_at:    Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    updated_by:    Mapped[str]      = mapped_column(String(150), nullable=False, default="system")

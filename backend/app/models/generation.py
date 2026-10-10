import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class GeneratedDocument(Base):
    __tablename__ = "generated_documents"

    id:            Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:       Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mode:          Mapped[str]       = mapped_column(String(20), nullable=False)   # "generated" | "analyzed"
    contract_type: Mapped[str]       = mapped_column(String(50), nullable=False)   # "travail" | "bail" | "vente" | "prestation"
    title:         Mapped[str]       = mapped_column(String(255), nullable=False)
    content:       Mapped[str]       = mapped_column(Text, nullable=False)         # texte complet du contrat
    analysis:      Mapped[str | None]= mapped_column(Text, nullable=True)          # JSON analyse (mode analyzed)
    sources:       Mapped[str]       = mapped_column(Text, nullable=False, default="[]")  # JSON list articles RAG
    form_data:     Mapped[str]       = mapped_column(Text, nullable=False, default="{}")  # JSON inputs formulaire
    created_at:    Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:    Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user: Mapped["User"] = relationship("User")

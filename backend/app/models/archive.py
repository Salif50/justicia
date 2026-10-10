import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class DocumentArchive(Base):
    """Analyse de document archivée par l'utilisateur."""
    __tablename__ = "document_archives"

    id:             Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:        Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    filename:       Mapped[str]       = mapped_column(String(300), nullable=False)
    page_count:     Mapped[int]       = mapped_column(Integer, default=0)
    word_count:     Mapped[int]       = mapped_column(Integer, default=0)
    detail_level:   Mapped[str]       = mapped_column(String(20), default="standard")
    # Texte extrait (peut être volumineux)
    extracted_text: Mapped[str]       = mapped_column(Text, nullable=False, default="")
    # Résumé complet en JSON (sérialisé)
    summary_json:   Mapped[str]       = mapped_column(Text, nullable=False, default="{}")
    # Titre du résumé (dénormalisé pour l'affichage rapide dans la liste)
    summary_title:  Mapped[str]       = mapped_column(String(400), nullable=False, default="")
    created_at:     Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="document_archives")

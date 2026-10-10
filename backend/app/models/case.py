"""
Modèles pour la gestion des procès (dossiers judiciaires).

Un Case (procès) appartient à un utilisateur et contient :
  - des CaseDocument  : fichiers PDF avec métadonnées
  - des CaseMessage   : messages du chat d'analyse IA
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class Case(Base):
    __tablename__ = "cases"

    id:          Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:     Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name:        Mapped[str]        = mapped_column(String(200), nullable=False)
    description: Mapped[str]        = mapped_column(Text, nullable=False, default="")
    created_at:  Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:  Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    documents: Mapped[list["CaseDocument"]] = relationship(
        "CaseDocument", back_populates="case", cascade="all, delete-orphan", order_by="CaseDocument.created_at"
    )
    agenda_events: Mapped[list["AgendaEvent"]] = relationship(
        "AgendaEvent", back_populates="case", cascade="all, delete-orphan"
    )
    notes: Mapped[list["CaseNote"]] = relationship(
        "CaseNote", back_populates="case", cascade="all, delete-orphan", order_by="CaseNote.declared_at"
    )
    messages: Mapped[list["CaseMessage"]] = relationship(
        "CaseMessage", back_populates="case", cascade="all, delete-orphan", order_by="CaseMessage.created_at"
    )
    user = relationship("User", back_populates="cases")


class CaseDocument(Base):
    __tablename__ = "case_documents"

    id:             Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id:        Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    name:           Mapped[str]        = mapped_column(String(300), nullable=False)          # titre / libellé du document
    doc_type:       Mapped[str]        = mapped_column(String(100), nullable=False, default="Autre")  # PV, Ordonnance de renvoi, Jugement, etc.
    author:         Mapped[str | None] = mapped_column(String(200), nullable=True)
    doc_date:       Mapped[str | None] = mapped_column(String(30),  nullable=True)           # date du document (texte libre)
    file_path:      Mapped[str]        = mapped_column(String(500), nullable=False)          # chemin relatif sur le serveur
    original_name:  Mapped[str]        = mapped_column(String(300), nullable=False)          # nom d'origine du fichier
    file_size:      Mapped[int]        = mapped_column(Integer, default=0)                   # en octets
    extracted_text: Mapped[str | None] = mapped_column(Text, nullable=True)                  # texte extrait du PDF
    page_count:     Mapped[int]        = mapped_column(Integer, default=0)
    created_at:     Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc)

    case: Mapped["Case"] = relationship("Case", back_populates="documents")


class CaseNote(Base):
    """
    Déclaration / note horodatée prise pendant un procès.
    Remplace la prise de notes papier : qui a dit quoi, quand.
    """
    __tablename__ = "case_notes"

    id:           Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id:      Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    author:       Mapped[str]        = mapped_column(String(200), nullable=False)          # "Accusé Camara", "Témoin Bah", "Juge"…
    note_type:    Mapped[str]        = mapped_column(String(50),  nullable=False, default="Déclaration")  # Déclaration, Témoignage, Observation, Objection…
    content:      Mapped[str]        = mapped_column(Text, nullable=False)
    declared_at:  Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc)  # date/heure de la déclaration
    created_at:   Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:   Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    case: Mapped["Case"] = relationship("Case", back_populates="notes")


class CaseMessage(Base):
    __tablename__ = "case_messages"

    id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    case_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role:       Mapped[str]       = mapped_column(String(20), nullable=False)   # "user" | "assistant"
    content:    Mapped[str]       = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)

    case: Mapped["Case"] = relationship("Case", back_populates="messages")

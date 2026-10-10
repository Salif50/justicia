import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class AgendaEvent(Base):
    """Événement de l'agenda (audience, délai, réunion…)."""
    __tablename__ = "agenda_events"

    id:             Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:        Mapped[uuid.UUID]      = mapped_column(UUID(as_uuid=True), ForeignKey("users.id",  ondelete="CASCADE"), nullable=False, index=True)
    # Lien optionnel vers un procès
    case_id:        Mapped[uuid.UUID|None] = mapped_column(UUID(as_uuid=True), ForeignKey("cases.id", ondelete="SET NULL"), nullable=True, index=True)

    title:          Mapped[str]            = mapped_column(String(300), nullable=False)
    description:    Mapped[str]            = mapped_column(Text,        nullable=False, default="")
    location:       Mapped[str|None]       = mapped_column(String(300), nullable=True)

    # Type : audience | delai_recours | delai_prescription | remise_document |
    #        consultation | reunion | autre
    event_type:     Mapped[str]            = mapped_column(String(50),  nullable=False, default="audience")

    # Dates
    start_at:       Mapped[datetime]       = mapped_column(DateTime(timezone=True), nullable=False)
    end_at:         Mapped[datetime|None]  = mapped_column(DateTime(timezone=True), nullable=True)
    is_all_day:     Mapped[bool]           = mapped_column(Boolean, default=False)

    # Rappel (jours avant)
    reminder_days:  Mapped[int]            = mapped_column(Integer, default=1)

    # Couleur personnalisée (hex)
    color:          Mapped[str|None]       = mapped_column(String(10), nullable=True)

    # Statut : upcoming | done | cancelled
    status:         Mapped[str]            = mapped_column(String(20), nullable=False, default="upcoming")

    created_at:     Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:     Mapped[datetime]       = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    # Relations
    user: Mapped["User"] = relationship("User", back_populates="agenda_events")
    case: Mapped["Case|None"] = relationship("Case", back_populates="agenda_events")

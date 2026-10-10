from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def _now():
    return datetime.now(timezone.utc)


class Procedure(Base):
    __tablename__ = "procedures"

    id:           Mapped[int]      = mapped_column(Integer, primary_key=True, autoincrement=True)
    slug:         Mapped[str]      = mapped_column(String(100), unique=True, nullable=False, index=True)
    titre:        Mapped[str]      = mapped_column(String(300), nullable=False)
    categorie:    Mapped[str]      = mapped_column(String(100), nullable=False)
    icon:         Mapped[str]      = mapped_column(String(20),  default="📋")
    description:  Mapped[str]      = mapped_column(Text,        nullable=False)
    duree_totale: Mapped[str]      = mapped_column(String(100), nullable=False)
    cout_estime:  Mapped[str]      = mapped_column(String(200), nullable=False)
    difficulte:   Mapped[str]      = mapped_column(String(20),  default="Moyen")  # Facile/Moyen/Complexe
    urgence:      Mapped[bool]     = mapped_column(Boolean,     default=False)
    docs_requis:  Mapped[list]     = mapped_column(JSONB,       default=list)
    etapes:       Mapped[list]     = mapped_column(JSONB,       default=list)
    conseil:      Mapped[str]      = mapped_column(Text,        default="")
    base_legale:  Mapped[str]      = mapped_column(String(500), default="")
    questions_ia: Mapped[list]     = mapped_column(JSONB,       default=list)
    ordre:        Mapped[int]      = mapped_column(Integer,     default=0)
    actif:        Mapped[bool]     = mapped_column(Boolean,     default=True)
    created_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at:   Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

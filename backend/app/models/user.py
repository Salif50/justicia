import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id:                  Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email:               Mapped[str]        = mapped_column(String(255), unique=True, nullable=False, index=True)
    name:                Mapped[str]        = mapped_column(String(150), nullable=False)
    password_hash:       Mapped[str | None] = mapped_column(String(255), nullable=True)
    auth_provider:       Mapped[str]        = mapped_column(String(30), default="local")  # local | google
    google_id:           Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    phone:               Mapped[str | None] = mapped_column(String(30), nullable=True)
    birth_date:          Mapped[str | None] = mapped_column(String(30), nullable=True)
    profession:          Mapped[str | None] = mapped_column(String(150), nullable=True)
    address:             Mapped[str | None] = mapped_column(Text, nullable=True)
    language:            Mapped[str]        = mapped_column(String(10), default="fr")
    role:                Mapped[str]        = mapped_column(String(20), default="user")   # user | admin
    is_active:           Mapped[bool]       = mapped_column(Boolean, default=True)
    is_verified:         Mapped[bool]       = mapped_column(Boolean, default=False)
    # ── Profil utilisateur ─────────────────────────────────────────────────────
    # Type de profil : citoyen | etudiant | avocat | notaire | magistrat |
    #                  procureur | greffier | huissier | juriste | chercheur | autre
    profile_type:        Mapped[str | None] = mapped_column(String(50), nullable=True)
    profile_completed:   Mapped[bool]       = mapped_column(Boolean, default=False)
    bio:                 Mapped[str | None] = mapped_column(Text, nullable=True)
    organization:        Mapped[str | None] = mapped_column(String(200), nullable=True)
    bar_number:          Mapped[str | None] = mapped_column(String(100), nullable=True)  # barreau / tribunal
    city:                Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Réponses au sondage d'accueil (domaines, usage, source…) ; {"skipped": true} si passé
    onboarding_survey:   Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    # ── Modération (admin) ─────────────────────────────────────────────────────
    # Quota journalier propre à l'utilisateur : None = limite du plan, -1 = illimité
    daily_limit_override: Mapped[int | None]      = mapped_column(Integer, nullable=True)
    blocked_reason:       Mapped[str | None]      = mapped_column(Text, nullable=True)
    blocked_at:           Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Fin d'une suspension temporaire (None = suspension sans échéance)
    blocked_until:        Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    admin_notes:          Mapped[str | None]      = mapped_column(Text, nullable=True)
    # ──────────────────────────────────────────────────────────────────────────
    created_at:          Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at:          Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    last_login:          Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relations
    preferences:   Mapped["UserPreferences | None"] = relationship("UserPreferences", back_populates="user", uselist=False, cascade="all, delete-orphan")
    stats:         Mapped["UserStats | None"]        = relationship("UserStats",       back_populates="user", uselist=False, cascade="all, delete-orphan")
    conversations: Mapped[list["Conversation"]]      = relationship("Conversation",    back_populates="user", cascade="all, delete-orphan")
    subscriptions: Mapped[list["Subscription"]]      = relationship("Subscription",    back_populates="user", cascade="all, delete-orphan")
    custom_agents: Mapped[list["CustomAgent"]]       = relationship("CustomAgent",     back_populates="user", cascade="all, delete-orphan")
    cases:         Mapped[list["Case"]]              = relationship("Case",            back_populates="user", cascade="all, delete-orphan")
    notifications:      Mapped[list["Notification"]]      = relationship("Notification",      back_populates="user", cascade="all, delete-orphan")
    document_archives:  Mapped[list["DocumentArchive"]]   = relationship("DocumentArchive",   back_populates="user", cascade="all, delete-orphan")
    agenda_events:      Mapped[list["AgendaEvent"]]        = relationship("AgendaEvent",        back_populates="user", cascade="all, delete-orphan")


class UserPreferences(Base):
    __tablename__ = "user_preferences"

    user_id:             Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    save_conversations:  Mapped[bool]      = mapped_column(Boolean, default=True)
    enable_notifications:Mapped[bool]      = mapped_column(Boolean, default=True)
    auto_save_chat:      Mapped[bool]      = mapped_column(Boolean, default=True)
    theme:               Mapped[str]       = mapped_column(String(20), default="light")
    compact_mode:        Mapped[bool]      = mapped_column(Boolean, default=False)
    session_timeout:     Mapped[int]       = mapped_column(default=30)
    two_factor_auth:     Mapped[bool]      = mapped_column(Boolean, default=False)
    email_notifications: Mapped[bool]      = mapped_column(Boolean, default=True)
    push_notifications:  Mapped[bool]      = mapped_column(Boolean, default=False)
    share_analytics:     Mapped[bool]      = mapped_column(Boolean, default=True)
    show_online_status:  Mapped[bool]      = mapped_column(Boolean, default=True)
    newsletter:          Mapped[bool]      = mapped_column(Boolean, default=False)
    # Mode éphémère : les conversations ne sont PAS sauvegardées en base
    ephemeral_mode:      Mapped[bool]      = mapped_column(Boolean, default=False)

    user: Mapped["User"] = relationship("User", back_populates="preferences")


class UserStats(Base):
    __tablename__ = "user_stats"

    user_id:              Mapped[uuid.UUID]    = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    conversations_count:  Mapped[int]          = mapped_column(Integer, default=0)
    questions_count:      Mapped[int]          = mapped_column(Integer, default=0)
    agents_used_count:    Mapped[int]          = mapped_column(Integer, default=0)
    documents_count:      Mapped[int]          = mapped_column(Integer, default=0)
    daily_questions_count: Mapped[int]         = mapped_column(Integer, default=0)
    daily_reset_date:     Mapped[date | None]  = mapped_column(Date, nullable=True)

    user: Mapped["User"] = relationship("User", back_populates="stats")

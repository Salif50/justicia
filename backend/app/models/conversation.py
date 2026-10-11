import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class Conversation(Base):
    __tablename__ = "conversations"

    id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title:      Mapped[str]       = mapped_column(String(255), default="Nouvelle conversation")
    agent_id:   Mapped[str]       = mapped_column(String(50), default="jurisprudence")
    ai_name:    Mapped[str]       = mapped_column(String(100), default="JusticIA")
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)
    updated_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)

    user:     Mapped["User"]        = relationship("User",    back_populates="conversations")
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    __tablename__ = "messages"

    id:              Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID]  = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    content:         Mapped[str]        = mapped_column(Text, nullable=False)
    sender:          Mapped[str]        = mapped_column(String(10), nullable=False)  # user | bot
    sources:         Mapped[list | None]= mapped_column(JSON, nullable=True)         # Articles RAG sources
    # Nature de l'échange : legal | greeting | thanks | farewell | about | offtopic
    kind:            Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at:      Mapped[datetime]   = mapped_column(DateTime(timezone=True), default=now_utc)

    conversation: Mapped["Conversation"] = relationship("Conversation", back_populates="messages")

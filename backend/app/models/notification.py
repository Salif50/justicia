import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def now_utc():
    return datetime.now(timezone.utc)


class Notification(Base):
    __tablename__ = "notifications"

    id:         Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id:    Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    type:       Mapped[str]       = mapped_column(String(50),  nullable=False, default="info")
    # info | success | warning | case | conversation | system
    title:      Mapped[str]       = mapped_column(String(200), nullable=False)
    message:    Mapped[str]       = mapped_column(Text,        nullable=False)
    link:       Mapped[str|None]  = mapped_column(String(300), nullable=True)
    is_read:    Mapped[bool]      = mapped_column(Boolean,     default=False)
    created_at: Mapped[datetime]  = mapped_column(DateTime(timezone=True), default=now_utc)

    user: Mapped["User"] = relationship("User", back_populates="notifications")

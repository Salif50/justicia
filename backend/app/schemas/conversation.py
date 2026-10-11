import uuid as _uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, field_validator


class SendMessageRequest(BaseModel):
    message: str
    agent_id: str = "jurisprudence"
    conversation_id: Optional[str] = None


class MessageOut(BaseModel):
    id: str
    content: str
    sender: str
    sources: Optional[list] = None
    created_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_uuid(cls, v: Any) -> str:
        return str(v)

    @field_validator("sources", mode="before")
    @classmethod
    def coerce_sources(cls, v: Any) -> list:
        if v is None:
            return []
        if isinstance(v, list):
            return v
        return []


class ConversationOut(BaseModel):
    id: str
    title: str
    agent_id: str
    ai_name: str
    messages: list[MessageOut] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_uuid(cls, v: Any) -> str:
        return str(v)


class ConversationSummary(BaseModel):
    id: str
    title: str
    agent_id: str
    ai_name: str
    created_at: datetime
    updated_at: datetime
    message_count: int = 0

    model_config = {"from_attributes": True}


class SendMessageResponse(BaseModel):
    id: str
    content: str
    sources: list = []
    conversation_id: Optional[str] = None
    created_at: datetime
    ephemeral: bool = False
    # legal | greeting | thanks | farewell | about | offtopic
    kind: str = "legal"
    # La question a-t-elle été décomptée du quota journalier ?
    counted: bool = True

from datetime import datetime
from typing import Optional

from pydantic import BaseModel


# ── Notes / Déclarations ──────────────────────────────────────────────────────

class CaseNoteCreate(BaseModel):
    author: str
    note_type: str = "Déclaration"
    content: str
    declared_at: Optional[datetime] = None  # si None → now


class CaseNoteUpdate(BaseModel):
    author: Optional[str] = None
    note_type: Optional[str] = None
    content: Optional[str] = None
    declared_at: Optional[datetime] = None


class CaseNoteOut(BaseModel):
    id: str
    author: str
    note_type: str
    content: str
    declared_at: datetime
    created_at: datetime
    updated_at: datetime


# ── Procès ────────────────────────────────────────────────────────────────────

class CaseCreate(BaseModel):
    name: str
    description: Optional[str] = ""


class CaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class CaseOut(BaseModel):
    id: str
    name: str
    description: str
    document_count: int
    created_at: datetime
    updated_at: datetime


class CaseDocumentOut(BaseModel):
    id: str
    name: str
    doc_type: str
    author: Optional[str]
    doc_date: Optional[str]
    original_name: str
    file_size: int
    page_count: int
    has_text: bool
    created_at: datetime


class CaseOutDetail(CaseOut):
    documents: list[CaseDocumentOut] = []
    notes: list[CaseNoteOut] = []


class CaseChatRequest(BaseModel):
    message: str
    source: str = "all"   # "all" | "documents" | "notes"


class CaseChatResponse(BaseModel):
    id: str
    content: str
    created_at: datetime


class CaseMessageOut(BaseModel):
    id: str
    role: str   # "user" | "assistant"
    content: str
    created_at: datetime

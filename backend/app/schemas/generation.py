from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class GenerateRequest(BaseModel):
    contract_type:    str
    form_data:        dict
    user_directives:  str = ""


class GenerateResponse(BaseModel):
    id:         str
    title:      str
    content:    str
    sources:    list
    created_at: datetime


class AnalyzeIssue(BaseModel):
    severity:       str
    clause:         str
    article_viole:  str = ""
    article:        str = ""   # rétrocompatibilité
    description:    str = ""
    suggestion:     str


class AnalyzeResponse(BaseModel):
    id:               str
    title:            str
    issues:           list[AnalyzeIssue]
    suggestions:      list[str]
    missing_clauses:  list[str] = []
    strong_points:    list[str] = []
    conformity_score: int = 50
    risk_level:       str
    verdict:          str = ""
    detected_type:    str = ""
    sources:          list
    created_at:       datetime


class DocumentArchiveOut(BaseModel):
    id:            str
    title:         str
    mode:          str
    contract_type: str
    created_at:    datetime

    model_config = {"from_attributes": True}


class DocumentArchiveDetail(DocumentArchiveOut):
    content:   str
    analysis:  Optional[str]
    sources:   str
    form_data: str

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class DiffItem(BaseModel):
    theme:          str
    text_a_extract: str = ""
    text_b_extract: str = ""
    impact:         str
    severity:       str  # critique | majeur | mineur
    favors:         str = ""  # "A" | "B" | "neutre"


class ArticleCheck(BaseModel):
    article:      str
    requirement:  str
    text_extract: str = ""
    status:       str  # conforme | partiel | manquant | violation
    note:         str = ""


class CompareTextsResponse(BaseModel):
    summary:           str
    similarity_score:  int
    key_differences:   list[DiffItem]
    text_a_strengths:  list[str]
    text_b_strengths:  list[str]
    text_a_weaknesses: list[str]
    text_b_weaknesses: list[str]
    recommendation:    str
    risk_a:            int
    risk_b:            int


class LegalCompareResponse(BaseModel):
    domain:            str
    summary:           str
    conformity_score:  int
    articles_compared: list[ArticleCheck]
    missing_clauses:   list[str] = []
    violations:        list[str] = []
    recommendation:    str

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class CustomAgentCreate(BaseModel):
    name:          str       = Field(..., min_length=2, max_length=150)
    description:   str       = Field("", max_length=500)
    system_prompt: str       = Field("", max_length=4000)
    doc_ids:       list[str] = Field(..., min_length=1)


class CustomAgentUpdate(BaseModel):
    name:          Optional[str] = Field(None, max_length=150)
    description:   Optional[str] = Field(None, max_length=500)
    system_prompt: Optional[str] = Field(None, max_length=4000)


class CustomAgentOut(BaseModel):
    id:            str
    name:          str
    description:   str
    system_prompt: str
    doc_ids:       list[str]
    domains:       list[str]
    created_at:    datetime

    model_config = {"from_attributes": True}


class DocumentTemplate(BaseModel):
    """Représente un document juridique du corpus (metadata.json)."""
    doc_id:            str
    nom:               str
    type:              str
    numero:            str = ""
    date_adoption:     str = ""
    date_promulgation: str = ""
    nombre_pages:      int = 0
    source_officielle: str = ""
    domaine:           str
    url_source:        str = ""


class BuiltinAgentConfigOut(BaseModel):
    agent_id:       str
    name:           str
    description:    str
    icon:           str
    category:       str
    domain_filter:  Optional[str]
    system_prompt:  str
    is_db_override: bool = False


class BuiltinAgentConfigUpdate(BaseModel):
    system_prompt: str = Field(..., min_length=20, max_length=8000)

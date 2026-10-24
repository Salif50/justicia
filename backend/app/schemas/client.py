from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class ClientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    organization: str | None = Field(default=None, max_length=200)
    status: str = Field(default="active", max_length=30)
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)
    organization: str | None = Field(default=None, max_length=200)
    status: str | None = Field(default=None, max_length=30)
    notes: str | None = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    name: str
    email: str | None
    phone: str | None
    organization: str | None
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

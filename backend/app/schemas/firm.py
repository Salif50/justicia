from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class InvitationCreate(BaseModel):
    email: EmailStr
    role: str = Field(default="member", pattern="^(member|admin|viewer)$")

class InvitationOut(BaseModel):
    id: str
    email: str
    role: str
    status: str
    created_at: datetime
    token: str | None = None

class MemberOut(BaseModel):
    id: str
    user_id: str
    name: str
    email: str
    role: str
    created_at: datetime

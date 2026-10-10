from pydantic import BaseModel, EmailStr


class ContactRequest(BaseModel):
    name: str
    email: EmailStr
    subject: str
    message: str


class AgentOut(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    category: str
    domain_filter: str | None = None

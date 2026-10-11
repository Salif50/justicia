from pydantic import BaseModel, Field, EmailStr


class ContactRequest(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    subject: str = Field(min_length=2, max_length=200)
    message: str = Field(min_length=5, max_length=5000)
    # Anti-robots : champ piège (doit rester vide) et durée de remplissage
    website: str | None = Field(default=None, max_length=200)
    elapsed_ms: int | None = None


class AgentOut(BaseModel):
    id: str
    name: str
    description: str
    icon: str
    category: str
    domain_filter: str | None = None

import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class SignupRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    # Anti-robots : champ piège (doit rester vide), durée de remplissage, Turnstile
    website: str | None = Field(default=None, max_length=200)
    elapsed_ms: int | None = None
    captcha_token: str | None = Field(default=None, max_length=4096)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 2:
            raise ValueError("Le nom doit contenir au moins 2 caractères.")
        if any(c in v for c in "<>{}/\\") or "http" in v.lower():
            raise ValueError("Le nom contient des caractères non autorisés.")
        return v


class SignupPendingResponse(BaseModel):
    """Inscription enregistrée : l'adresse doit être confirmée avant la connexion."""
    verification_required: bool = True
    email: str
    message: str


class EmailRequest(BaseModel):
    email: EmailStr


class VerifyEmailRequest(BaseModel):
    token: str = Field(max_length=2048)


class GoogleAuthRequest(BaseModel):
    token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: "UserOut"


class RefreshRequest(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    auth_provider: str
    profile_type: str | None = None
    profile_completed: bool = False

    model_config = {"from_attributes": True}

    @field_validator("id", mode="before")
    @classmethod
    def coerce_uuid(cls, v):
        return str(v) if isinstance(v, uuid.UUID) else v


TokenResponse.model_rebuild()


class ResetPasswordRequest(BaseModel):
    token: str = Field(max_length=2048)
    password: str = Field(min_length=8, max_length=128)

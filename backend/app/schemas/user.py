from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr


class UserProfileOut(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str]
    birth_date: Optional[str]
    profession: Optional[str]
    address: Optional[str]
    language: str
    role: str
    is_verified: bool
    # Profil
    profile_type: Optional[str] = None
    profile_completed: bool = False
    bio: Optional[str] = None
    organization: Optional[str] = None
    bar_number: Optional[str] = None
    city: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime]
    stats: Optional["StatsOut"]
    preferences: Optional["PreferencesOut"]

    model_config = {"from_attributes": True}


class StatsOut(BaseModel):
    conversations: int = 0
    questions: int = 0
    agents: int = 0
    documents: int = 0

    model_config = {"from_attributes": True}


class PreferencesOut(BaseModel):
    save_conversations: bool = True
    enable_notifications: bool = True
    auto_save_chat: bool = True
    theme: str = "light"
    compact_mode: bool = False
    session_timeout: int = 30
    two_factor_auth: bool = False
    email_notifications: bool = True
    push_notifications: bool = False
    share_analytics: bool = True
    show_online_status: bool = True
    newsletter: bool = False
    ephemeral_mode: bool = False

    model_config = {"from_attributes": True}


class CompleteProfileRequest(BaseModel):
    """Sondage d'accueil : type de profil, infos pro et réponses libres. Tout est facultatif (sondage passable)."""
    profile_type: Optional[str] = None       # citoyen | avocat | magistrat | ...
    survey: Optional[dict] = None            # domaines, usage, source… ; {"skipped": true} si passé
    name: Optional[str] = None
    phone: Optional[str] = None
    bio: Optional[str] = None
    organization: Optional[str] = None
    bar_number: Optional[str] = None         # N° barreau, tribunal, matric…
    city: Optional[str] = None
    profession: Optional[str] = None


class UpdateProfileRequest(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    birth_date: Optional[str] = None
    profession: Optional[str] = None
    address: Optional[str] = None
    language: Optional[str] = None
    bio: Optional[str] = None
    organization: Optional[str] = None
    bar_number: Optional[str] = None
    city: Optional[str] = None
    profile_type: Optional[str] = None


class UserFeaturesOut(BaseModel):
    """Fonctionnalités accessibles à l'utilisateur selon son plan actif."""
    plan_id: str
    plan_name: str
    features: list[str]
    is_free: bool


class UpdatePreferencesRequest(BaseModel):
    save_conversations: Optional[bool] = None
    enable_notifications: Optional[bool] = None
    auto_save_chat: Optional[bool] = None
    theme: Optional[str] = None
    compact_mode: Optional[bool] = None
    session_timeout: Optional[int] = None
    two_factor_auth: Optional[bool] = None
    email_notifications: Optional[bool] = None
    push_notifications: Optional[bool] = None
    share_analytics: Optional[bool] = None
    show_online_status: Optional[bool] = None
    newsletter: Optional[bool] = None
    ephemeral_mode: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


UserProfileOut.model_rebuild()

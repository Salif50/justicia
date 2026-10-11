from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field, field_validator

# Limite journalière pour le tier gratuit (sans abonnement)
FREE_DAILY_LIMIT = 40

PLANS = {
    "basic": {
        "id": "basic", "name": "Basic", "description": "Pour les particuliers",
        "price": 5000, "period": "mois",
        "daily_limit": 10,
        "features": ["10 questions/jour", "Accès aux agents de base", "Historique 30 jours"],
    },
    "pro": {
        "id": "pro", "name": "Pro", "description": "Pour les professionnels",
        "price": 15000, "period": "mois", "recommended": True,
        "daily_limit": -1,  # -1 = illimité
        "features": ["Questions illimitées", "Accès à tous les agents", "Historique illimité", "Support prioritaire"],
    },
    "enterprise": {
        "id": "enterprise", "name": "Entreprise", "description": "Pour les cabinets et institutions",
        "price": 50000, "period": "mois",
        "daily_limit": -1,
        "features": ["Multi-utilisateurs", "Questions illimitées", "Agents personnalisés", "Support 24/7", "API access"],
    },
}


class PlanOut(BaseModel):
    id: str
    name: str
    description: str
    price: float
    period: str
    features: list[str]
    recommended: bool = False
    daily_limit: int = -1


class SubscriptionOut(BaseModel):
    id: str
    plan_id: str
    name: str
    price: float
    period: str
    features: list[str]
    status: str
    renewal_date: Optional[datetime]
    payment_method: Optional[str]

    model_config = {"from_attributes": True}


class UpgradeRequest(BaseModel):
    plan_id: str
    payment_method: Optional[str] = None


class MosagixCheckoutRequest(BaseModel):
    plan_id: str = Field(min_length=1, max_length=50)
    payer_number: str

    @field_validator("payer_number")
    @classmethod
    def validate_payer_number(cls, value: str) -> str:
        number = value.strip()
        if not number.startswith("00") or not number[2:].isdigit() or not 10 <= len(number) <= 17:
            raise ValueError("Le numéro doit être au format international 00… (ex. 00224623707722).")
        return number


class MosagixCheckoutOut(BaseModel):
    payment_id: str
    merchant_reference: str
    checkout_url: str
    status: str
    amount: int
    currency: str


class MosagixStatusOut(BaseModel):
    available: bool
    message: Optional[str] = None
    sandbox: bool = False


class MosagixConfirmRequest(BaseModel):
    payment_id: str = Field(min_length=1, max_length=255)


class MosagixConfirmOut(BaseModel):
    status: str
    fulfilled: bool
    message: str


class InvoiceOut(BaseModel):
    id: str
    number: Optional[str] = None
    date: datetime
    plan_name: str
    description: Optional[str]
    amount: float
    status: str

    model_config = {"from_attributes": True}


class UsageOut(BaseModel):
    """Quota journalier de l'utilisateur."""
    plan_id: Optional[str]
    plan_name: str
    daily_limit: int          # -1 = illimité
    questions_today: int
    remaining: int            # -1 = illimité
    is_unlimited: bool
    is_free_tier: bool

    model_config = {"from_attributes": True}

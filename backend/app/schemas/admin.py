from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class AdminUserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str
    auth_provider: str
    is_active: bool
    is_verified: bool
    profession: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    conversations_count: int = 0
    questions_count: int = 0
    ephemeral_mode: bool = False
    subscription_plan: Optional[str] = None   # plan_id actif ou None

    model_config = {"from_attributes": True}


class AdminUserUpdate(BaseModel):
    role: Optional[str] = None       # user | admin
    is_active: Optional[bool] = None


class AdminContactOut(BaseModel):
    id: str
    name: str
    email: str
    subject: str
    message: str
    is_read: bool
    created_at: datetime


class AdminStatsOut(BaseModel):
    total_users: int
    active_users: int
    admin_users: int
    total_conversations: int
    total_messages: int
    total_contacts: int
    unread_contacts: int
    ephemeral_users: int = 0       # utilisateurs avec mode éphémère activé
    subscribed_users: int = 0      # utilisateurs avec un abonnement actif

"""
Calcul du quota journalier d'un utilisateur — source unique de vérité.

Ordre de priorité :
  1. quota personnalisé fixé par un admin (users.daily_limit_override) ;
  2. limite du plan de l'abonnement actif (pricing_plans.daily_limit) ;
  3. limite du plan « gratuit » (ou FREE_DAILY_LIMIT si absent de la base).
-1 signifie illimité.
"""
from dataclasses import dataclass
from datetime import date

from sqlalchemy import select

from app.models.content import PricingPlan
from app.models.subscription import Subscription
from app.models.user import User, UserStats
from app.schemas.subscription import FREE_DAILY_LIMIT


@dataclass
class Quota:
    daily_limit: int          # -1 = illimité
    plan_limit: int           # limite du plan seule (sans personnalisation)
    plan_id: str | None       # None = tier gratuit
    plan_name: str
    is_free_tier: bool
    is_override: bool         # True si un admin a fixé un quota personnalisé
    questions_today: int
    subscription: Subscription | None

    @property
    def is_unlimited(self) -> bool:
        return self.daily_limit == -1

    @property
    def remaining(self) -> int:
        return -1 if self.is_unlimited else max(0, self.daily_limit - self.questions_today)


async def active_subscription(user_id, db) -> Subscription | None:
    result = await db.execute(
        select(Subscription)
        .where(Subscription.user_id == user_id, Subscription.status == "active")
        .order_by(Subscription.created_at.desc())
    )
    return result.scalars().first()


async def resolve_quota(user: User, db, stats: UserStats | None = None) -> Quota:
    sub = await active_subscription(user.id, db)

    plan: PricingPlan | None = None
    if sub:
        plan = (await db.execute(select(PricingPlan).where(PricingPlan.plan_id == sub.plan_id))).scalar_one_or_none()

    if sub:
        plan_limit = plan.daily_limit if plan else FREE_DAILY_LIMIT
        plan_name = plan.name if plan else sub.plan_id
        plan_id = sub.plan_id
    else:
        free = (await db.execute(select(PricingPlan).where(PricingPlan.plan_id == "gratuit"))).scalar_one_or_none()
        plan_limit = free.daily_limit if free else FREE_DAILY_LIMIT
        plan_name = "Gratuit"
        plan_id = None

    override = getattr(user, "daily_limit_override", None)
    daily_limit = override if override is not None else plan_limit

    if stats is None:
        stats = (await db.execute(select(UserStats).where(UserStats.user_id == user.id))).scalar_one_or_none()
    questions_today = stats.daily_questions_count if stats and stats.daily_reset_date == date.today() else 0

    return Quota(
        daily_limit=daily_limit,
        plan_limit=plan_limit,
        plan_id=plan_id,
        plan_name=plan_name,
        is_free_tier=sub is None,
        is_override=override is not None,
        questions_today=questions_today,
        subscription=sub,
    )

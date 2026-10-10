"""
Administration des utilisateurs : fiche détaillée, modération, quotas,
historique des questions posées et journal des actions admin.

Toutes les actions qui modifient un compte sont tracées dans admin_audit_logs.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_, select, true

from app.core.deps import DB
from app.models.agenda import AgendaEvent
from app.models.archive import DocumentArchive
from app.models.case import Case
from app.models.content import PricingPlan
from app.models.conversation import Conversation, Message
from app.models.custom_agent import CustomAgent
from app.models.generation import GeneratedDocument
from app.models.moderation import AdminAuditLog
from app.models.subscription import Subscription
from app.models.user import User, UserPreferences, UserStats
from app.routers.admin import AdminUser
from app.services.moderation import lift_expired_suspensions, notify_user
from app.services.quota import resolve_quota

router = APIRouter(prefix="/admin", tags=["Administration — utilisateurs"])


# ── Utilitaires ───────────────────────────────────────────────────────────────

def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(400, "Identifiant invalide.")


async def _get_user(user_id: str, db) -> User:
    user = (await db.execute(select(User).where(User.id == _uuid(user_id)))).scalar_one_or_none()
    if not user:
        raise HTTPException(404, "Utilisateur introuvable.")
    return user


async def _audit(db, admin: User, action: str, target: User | None = None, **details) -> None:
    db.add(AdminAuditLog(
        admin_id=str(admin.id), admin_email=admin.email,
        target_user_id=str(target.id) if target else None,
        target_email=target.email if target else None,
        action=action, details=details or None,
    ))


def _iso(d: datetime | None) -> str | None:
    return d.isoformat() if d else None


async def _summary(u: User, db) -> dict:
    stats = (await db.execute(select(UserStats).where(UserStats.user_id == u.id))).scalar_one_or_none()
    prefs = (await db.execute(select(UserPreferences).where(UserPreferences.user_id == u.id))).scalar_one_or_none()
    quota = await resolve_quota(u, db, stats)
    return {
        "id": str(u.id), "email": u.email, "name": u.name, "role": u.role,
        "auth_provider": u.auth_provider, "is_active": u.is_active, "is_verified": u.is_verified,
        "profile_type": u.profile_type, "organization": u.organization, "city": u.city,
        "created_at": _iso(u.created_at), "last_login": _iso(u.last_login),
        "blocked_reason": u.blocked_reason, "blocked_at": _iso(u.blocked_at),
        "blocked_until": _iso(u.blocked_until),
        "plan_id": quota.plan_id, "plan_name": quota.plan_name, "is_free_tier": quota.is_free_tier,
        "daily_limit": quota.daily_limit, "plan_limit": quota.plan_limit, "is_override": quota.is_override,
        "questions_today": quota.questions_today,
        "questions_count": stats.questions_count if stats else 0,
        "conversations_count": stats.conversations_count if stats else 0,
        "ephemeral_mode": prefs.ephemeral_mode if prefs else False,
    }


# ── Liste ─────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    db: DB, _: User = AdminUser,
    q: str = "", status: Literal["all", "active", "blocked"] = "all",
    plan: str = "", role: str = "",
    sort: Literal["recent", "last_login", "questions"] = "recent",
    skip: int = 0, limit: int = Query(50, le=200),
):
    """Liste paginée et filtrable des utilisateurs."""
    await lift_expired_suspensions(db)
    conds = []
    if q.strip():
        like = f"%{q.strip()}%"
        conds.append(or_(User.name.ilike(like), User.email.ilike(like),
                         User.organization.ilike(like), User.city.ilike(like)))
    if status == "active":
        conds.append(User.is_active.is_(True))
    elif status == "blocked":
        conds.append(User.is_active.is_(False))
    if role in ("user", "admin"):
        conds.append(User.role == role)
    if plan:
        active_ids = select(Subscription.user_id).where(Subscription.status == "active")
        if plan == "gratuit":
            conds.append(User.id.not_in(active_ids))
        else:
            conds.append(User.id.in_(active_ids.where(Subscription.plan_id == plan)))

    base = select(User).outerjoin(UserStats, UserStats.user_id == User.id).where(and_(*conds) if conds else true())
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()

    order = {
        "recent": User.created_at.desc(),
        "last_login": User.last_login.desc().nulls_last(),
        "questions": func.coalesce(UserStats.questions_count, 0).desc(),
    }[sort]
    users = (await db.execute(base.order_by(order).offset(skip).limit(limit))).scalars().all()

    counts = {
        "all": (await db.execute(select(func.count(User.id)))).scalar_one(),
        "blocked": (await db.execute(select(func.count(User.id)).where(User.is_active.is_(False)))).scalar_one(),
        "admins": (await db.execute(select(func.count(User.id)).where(User.role == "admin"))).scalar_one(),
    }
    return {"items": [await _summary(u, db) for u in users], "total": total, "counts": counts}


# ── Fiche détaillée ───────────────────────────────────────────────────────────

@router.get("/users/{user_id}/detail")
async def user_detail(user_id: str, db: DB, _: User = AdminUser):
    u = await _get_user(user_id, db)
    await lift_expired_suspensions(db)
    summary = await _summary(u, db)
    prefs = (await db.execute(select(UserPreferences).where(UserPreferences.user_id == u.id))).scalar_one_or_none()

    async def count(model) -> int:
        return (await db.execute(select(func.count()).select_from(model).where(model.user_id == u.id))).scalar_one()

    subs = (await db.execute(
        select(Subscription).where(Subscription.user_id == u.id).order_by(Subscription.created_at.desc())
    )).scalars().all()

    recent = (await db.execute(
        select(Message, Conversation)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == u.id, Message.sender == "user")
        .order_by(Message.created_at.desc()).limit(15)
    )).all()

    # Activité des 14 derniers jours (questions enregistrées par jour)
    since = datetime.now(timezone.utc) - timedelta(days=13)
    per_day = dict((await db.execute(
        select(func.date(Message.created_at), func.count())
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(Conversation.user_id == u.id, Message.sender == "user", Message.created_at >= since)
        .group_by(func.date(Message.created_at))
    )).all())
    today = date.today()
    activity = [{"date": (today - timedelta(days=i)).isoformat(),
                 "count": per_day.get(today - timedelta(days=i), 0)} for i in range(13, -1, -1)]

    audit = (await db.execute(
        select(AdminAuditLog).where(AdminAuditLog.target_user_id == str(u.id))
        .order_by(AdminAuditLog.created_at.desc()).limit(30)
    )).scalars().all()

    plans = (await db.execute(select(PricingPlan).order_by(PricingPlan.id))).scalars().all()

    return {
        **summary,
        "phone": u.phone, "profession": u.profession, "bar_number": u.bar_number,
        "address": u.address, "bio": u.bio, "language": u.language,
        "profile_completed": u.profile_completed, "onboarding_survey": u.onboarding_survey,
        "admin_notes": u.admin_notes, "updated_at": _iso(u.updated_at),
        "preferences": {
            "ephemeral_mode": prefs.ephemeral_mode, "save_conversations": prefs.save_conversations,
            "newsletter": prefs.newsletter, "share_analytics": prefs.share_analytics,
        } if prefs else None,
        "usage": {
            "cases": await count(Case), "custom_agents": await count(CustomAgent),
            "archives": await count(DocumentArchive), "generated_documents": await count(GeneratedDocument),
            "agenda_events": await count(AgendaEvent),
        },
        "subscriptions": [{
            "id": str(s.id), "plan_id": s.plan_id, "status": s.status, "payment_method": s.payment_method,
            "created_at": _iso(s.created_at), "renewal_date": _iso(s.renewal_date),
        } for s in subs],
        "recent_questions": [{
            "id": str(m.id), "question": m.content, "created_at": _iso(m.created_at),
            "conversation_id": str(c.id), "conversation_title": c.title, "agent_id": c.agent_id,
        } for m, c in recent],
        "activity": activity,
        "audit": [_audit_out(a) for a in audit],
        "available_plans": [{"plan_id": "gratuit", "name": "Gratuit"}] + [
            {"plan_id": p.plan_id, "name": p.name, "daily_limit": p.daily_limit}
            for p in plans if p.plan_id and p.plan_id != "gratuit"
        ],
    }


# ── Actions de modération ─────────────────────────────────────────────────────

class QuotaIn(BaseModel):
    daily_limit: Optional[int] = Field(None, ge=-1, le=100000)  # None = revenir à la limite du plan
    notify: bool = True


@router.put("/users/{user_id}/quota")
async def set_quota(user_id: str, body: QuotaIn, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    before = u.daily_limit_override
    u.daily_limit_override = body.daily_limit
    await _audit(db, admin, "quota", u, before=before, after=body.daily_limit)
    if body.notify and before != body.daily_limit:
        quota = await resolve_quota(u, db)
        await notify_user(db, u, "quota", override=body.daily_limit, limit=quota.daily_limit)
    await db.commit()
    return await _summary(u, db)


@router.post("/users/{user_id}/reset-quota")
async def reset_quota(user_id: str, db: DB, admin: User = AdminUser, notify: bool = True):
    u = await _get_user(user_id, db)
    stats = (await db.execute(select(UserStats).where(UserStats.user_id == u.id))).scalar_one_or_none()
    if stats:
        stats.daily_questions_count = 0
        stats.daily_reset_date = date.today()
    await _audit(db, admin, "reset_quota", u)
    if notify:
        await notify_user(db, u, "quota_reset")
    await db.commit()
    return await _summary(u, db)


class PlanIn(BaseModel):
    plan_id: str
    months: int = Field(12, ge=1, le=60)
    notify: bool = True


@router.put("/users/{user_id}/plan")
async def set_plan(user_id: str, body: PlanIn, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    if body.plan_id != "gratuit":
        exists = (await db.execute(select(PricingPlan).where(PricingPlan.plan_id == body.plan_id))).scalar_one_or_none()
        if not exists:
            raise HTTPException(400, "Plan inconnu.")

    current = (await db.execute(
        select(Subscription).where(Subscription.user_id == u.id, Subscription.status == "active")
    )).scalars().all()
    before = current[0].plan_id if current else "gratuit"
    for s in current:
        s.status = "cancelled"
    until = None
    plan_name = "Gratuit"
    if body.plan_id != "gratuit":
        until = datetime.now(timezone.utc) + timedelta(days=30 * body.months)
        plan_name = exists.name
        db.add(Subscription(
            user_id=u.id, plan_id=body.plan_id, status="active", payment_method="admin_override",
            renewal_date=until,
        ))
    await _audit(db, admin, "plan", u, before=before, after=body.plan_id, months=body.months)
    if body.notify and before != body.plan_id:
        await notify_user(db, u, "plan", plan_id=body.plan_id, plan_name=plan_name, until=until)
    await db.commit()
    return await _summary(u, db)


class BlockIn(BaseModel):
    blocked: bool
    reason: Optional[str] = Field(None, max_length=500)
    duration_days: Optional[int] = Field(None, ge=1, le=365)  # None = sans échéance
    notify: bool = True


@router.put("/users/{user_id}/block")
async def set_block(user_id: str, body: BlockIn, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    if u.id == admin.id:
        raise HTTPException(400, "Vous ne pouvez pas suspendre votre propre compte.")
    if body.blocked and not (body.reason or "").strip():
        raise HTTPException(400, "Indiquez le motif de la suspension.")
    was_active = u.is_active
    now = datetime.now(timezone.utc)
    u.is_active = not body.blocked
    u.blocked_reason = body.reason.strip() if body.blocked else None
    u.blocked_at = now if body.blocked else None
    u.blocked_until = now + timedelta(days=body.duration_days) if body.blocked and body.duration_days else None
    await _audit(db, admin, "block" if body.blocked else "unblock", u,
                 reason=u.blocked_reason, until=_iso(u.blocked_until), days=body.duration_days)
    if body.notify and was_active == body.blocked:  # n'informe que d'un vrai changement d'état
        if body.blocked:
            await notify_user(db, u, "block", reason=u.blocked_reason, until=u.blocked_until)
        else:
            await notify_user(db, u, "unblock")
    await db.commit()
    return await _summary(u, db)


class RoleIn(BaseModel):
    role: Literal["user", "admin"]


@router.put("/users/{user_id}/role")
async def set_role(user_id: str, body: RoleIn, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    if u.id == admin.id and body.role == "user":
        raise HTTPException(400, "Vous ne pouvez pas retirer vos propres droits d'administrateur.")
    before = u.role
    u.role = body.role
    await _audit(db, admin, "role", u, before=before, after=body.role)
    if body.role == "admin" and before != "admin":
        await notify_user(db, u, "role_admin", email=False)
    await db.commit()
    return await _summary(u, db)


class NotesIn(BaseModel):
    notes: str = Field("", max_length=5000)


@router.put("/users/{user_id}/notes")
async def set_notes(user_id: str, body: NotesIn, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    u.admin_notes = body.notes.strip() or None
    await _audit(db, admin, "notes", u)
    await db.commit()
    return {"admin_notes": u.admin_notes}


@router.delete("/users/{user_id}/conversations")
async def delete_conversations(user_id: str, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    convs = (await db.execute(select(Conversation).where(Conversation.user_id == u.id))).scalars().all()
    for c in convs:
        await db.delete(c)
    await _audit(db, admin, "delete_conversations", u, count=len(convs))
    await db.commit()
    return {"success": True, "deleted": len(convs)}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, db: DB, admin: User = AdminUser):
    u = await _get_user(user_id, db)
    if u.id == admin.id:
        raise HTTPException(400, "Vous ne pouvez pas supprimer votre propre compte.")
    await _audit(db, admin, "delete_user", u, name=u.name)
    await db.delete(u)
    await db.commit()
    return {"success": True}


# ── Historique des questions ─────────────────────────────────────────────────

@router.get("/questions")
async def list_questions(
    db: DB, _: User = AdminUser,
    q: str = "", user_id: str = "", agent_id: str = "",
    period: Literal["all", "today", "7d", "30d"] = "all",
    skip: int = 0, limit: int = Query(30, le=100),
):
    """Toutes les questions posées par les utilisateurs (hors mode éphémère, jamais enregistré)."""
    conds = [Message.sender == "user"]
    if q.strip():
        conds.append(Message.content.ilike(f"%{q.strip()}%"))
    if user_id:
        conds.append(Conversation.user_id == _uuid(user_id))
    if agent_id:
        conds.append(Conversation.agent_id == agent_id)
    now = datetime.now(timezone.utc)
    if period != "all":
        start = {"today": now.replace(hour=0, minute=0, second=0, microsecond=0),
                 "7d": now - timedelta(days=7), "30d": now - timedelta(days=30)}[period]
        conds.append(Message.created_at >= start)

    base = (select(Message, Conversation, User)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .join(User, User.id == Conversation.user_id)
            .where(*conds))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar_one()
    rows = (await db.execute(base.order_by(Message.created_at.desc()).offset(skip).limit(limit))).all()

    # Réponse associée : premier message bot qui suit la question dans la conversation
    conv_ids = {c.id for _, c, _ in rows}
    bots: dict = {}
    if conv_ids:
        for b in (await db.execute(
            select(Message).where(Message.conversation_id.in_(conv_ids), Message.sender == "bot")
            .order_by(Message.created_at)
        )).scalars():
            bots.setdefault(b.conversation_id, []).append(b)

    def answer_for(m: Message):
        return next((b for b in bots.get(m.conversation_id, []) if b.created_at >= m.created_at), None)

    items = []
    for m, c, u in rows:
        a = answer_for(m)
        items.append({
            "id": str(m.id), "question": m.content, "created_at": _iso(m.created_at),
            "conversation_id": str(c.id), "conversation_title": c.title, "agent_id": c.agent_id,
            "user_id": str(u.id), "user_name": u.name, "user_email": u.email, "user_active": u.is_active,
            "answer": a.content if a else None,
            "sources_count": len(a.sources or []) if a else 0,
        })

    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    q_today = select(func.count()).select_from(Message).where(Message.sender == "user", Message.created_at >= day_start)
    users_today = (select(func.count(func.distinct(Conversation.user_id)))
                   .join(Message, Message.conversation_id == Conversation.id)
                   .where(Message.sender == "user", Message.created_at >= day_start))
    q_week = select(func.count()).select_from(Message).where(Message.sender == "user", Message.created_at >= now - timedelta(days=7))
    return {
        "items": items, "total": total,
        "stats": {
            "today": (await db.execute(q_today)).scalar_one(),
            "week": (await db.execute(q_week)).scalar_one(),
            "users_today": (await db.execute(users_today)).scalar_one(),
        },
    }


# ── Journal des actions ──────────────────────────────────────────────────────

def _audit_out(a: AdminAuditLog) -> dict:
    return {
        "id": a.id, "action": a.action, "details": a.details,
        "admin_email": a.admin_email, "target_user_id": a.target_user_id,
        "target_email": a.target_email, "created_at": _iso(a.created_at),
    }


@router.get("/audit")
async def list_audit(db: DB, _: User = AdminUser, skip: int = 0, limit: int = Query(50, le=200)):
    rows = (await db.execute(
        select(AdminAuditLog).order_by(AdminAuditLog.created_at.desc()).offset(skip).limit(limit)
    )).scalars().all()
    return [_audit_out(a) for a in rows]

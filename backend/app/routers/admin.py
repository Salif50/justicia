"""
Routes d'administration JusticIA — accessibles uniquement aux utilisateurs role='admin'.
"""
import csv
import io
import json
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy import cast, Date, func, or_, select, text

from app.core.deps import CurrentUser, DB
from app.models.content import FaqItem, Partner, PricingPlan, SiteConfig, Testimonial
from app.models.conversation import Conversation, Message
from app.models.moderation import ModerationRule
from app.models.subscription import Contact, Subscription
from app.models.user import User, UserPreferences, UserStats
from app.schemas.admin import (AdminContactOut, AdminStatsOut, AdminUserOut,
                                AdminUserUpdate)
from app.schemas.content import (FaqItemCreate, FaqItemOut, FaqItemUpdate,
                                  PartnerCreate, PartnerOut, PartnerUpdate,
                                  PricingPlanCreate, PricingPlanOut, PricingPlanUpdate,
                                  SiteConfigOut, SiteConfigUpdate,
                                  TestimonialCreate, TestimonialOut, TestimonialUpdate)

router = APIRouter(prefix="/admin", tags=["Administration"])


# ── Dépendance : vérifie que l'utilisateur est admin ─────────────────────────
def require_admin(current_user: CurrentUser) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Accès réservé aux administrateurs.",
        )
    return current_user


AdminUser = Depends(require_admin)


# ── Stats globales ─────────────────────────────────────────────────────────────
@router.get("/stats", response_model=AdminStatsOut)
async def get_stats(db: DB, _: User = AdminUser):
    total_users     = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    active_users    = (await db.execute(select(func.count()).select_from(User).where(User.is_active == True))).scalar() or 0
    admin_users     = (await db.execute(select(func.count()).select_from(User).where(User.role == "admin"))).scalar() or 0
    total_convs     = (await db.execute(select(func.count()).select_from(Conversation))).scalar() or 0
    total_messages  = (await db.execute(select(func.count()).select_from(Message))).scalar() or 0
    total_contacts  = (await db.execute(select(func.count()).select_from(Contact))).scalar() or 0
    unread_contacts = (await db.execute(select(func.count()).select_from(Contact).where(Contact.is_read == False))).scalar() or 0
    ephemeral_users = (await db.execute(
        select(func.count()).select_from(UserPreferences).where(UserPreferences.ephemeral_mode == True)
    )).scalar() or 0
    subscribed_users = (await db.execute(
        select(func.count(Subscription.user_id.distinct())).where(Subscription.status == "active")
    )).scalar() or 0

    return AdminStatsOut(
        total_users=total_users, active_users=active_users, admin_users=admin_users,
        total_conversations=total_convs, total_messages=total_messages,
        total_contacts=total_contacts, unread_contacts=unread_contacts,
        ephemeral_users=ephemeral_users, subscribed_users=subscribed_users,
    )


# ── Métriques de performance ──────────────────────────────────────────────────
@router.get("/metrics")
async def get_metrics(db: DB, _: User = AdminUser, days: int = 30):
    since = datetime.now(timezone.utc) - timedelta(days=days)

    async def per_day(model, col):
        q = await db.execute(
            select(cast(col, Date).label("d"), func.count().label("c"))
            .where(col >= since)
            .group_by(cast(col, Date))
            .order_by(cast(col, Date))
        )
        return [{"date": str(r.d), "count": r.c} for r in q]

    users_per_day  = await per_day(User, User.created_at)
    convs_per_day  = await per_day(Conversation, Conversation.created_at)
    msgs_per_day   = await per_day(Message, Message.created_at)
    conts_per_day  = await per_day(Contact, Contact.created_at)

    # Auth provider distribution
    prov_q = await db.execute(
        select(User.auth_provider, func.count().label("c")).group_by(User.auth_provider)
    )
    auth_providers = {r.auth_provider: r.c for r in prov_q}

    # Week-over-week growth
    week_start = datetime.now(timezone.utc) - timedelta(days=7)
    prev_start = datetime.now(timezone.utc) - timedelta(days=14)

    this_week_users = (await db.execute(
        select(func.count()).select_from(User).where(User.created_at >= week_start)
    )).scalar() or 0
    last_week_users = (await db.execute(
        select(func.count()).select_from(User)
        .where(User.created_at >= prev_start, User.created_at < week_start)
    )).scalar() or 0
    this_week_convs = (await db.execute(
        select(func.count()).select_from(Conversation).where(Conversation.created_at >= week_start)
    )).scalar() or 0
    last_week_convs = (await db.execute(
        select(func.count()).select_from(Conversation)
        .where(Conversation.created_at >= prev_start, Conversation.created_at < week_start)
    )).scalar() or 0

    return {
        "users_per_day":         users_per_day,
        "conversations_per_day": convs_per_day,
        "messages_per_day":      msgs_per_day,
        "contacts_per_day":      conts_per_day,
        "auth_providers":        auth_providers,
        "growth": {
            "this_week_users": this_week_users,
            "last_week_users": last_week_users,
            "this_week_convs": this_week_convs,
            "last_week_convs": last_week_convs,
        },
    }


# ── Gestion des utilisateurs ──────────────────────────────────────────────────
# ── Gestion des messages de contact ──────────────────────────────────────────
@router.get("/contacts", response_model=list[AdminContactOut])
async def list_contacts(db: DB, _: User = AdminUser, unread_only: bool = False):
    query = select(Contact).order_by(Contact.created_at.desc())
    if unread_only:
        query = query.where(Contact.is_read == False)
    result  = await db.execute(query)
    contacts = result.scalars().all()
    return [
        AdminContactOut(
            id=str(c.id), name=c.name, email=c.email,
            subject=c.subject, message=c.message,
            is_read=c.is_read, created_at=c.created_at,
        )
        for c in contacts
    ]


@router.put("/contacts/{contact_id}/read")
async def mark_contact_read(contact_id: str, db: DB, _: User = AdminUser):
    result  = await db.execute(select(Contact).where(Contact.id == uuid.UUID(contact_id)))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Message introuvable.")
    contact.is_read = True
    await db.commit()
    return {"success": True}


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, db: DB, _: User = AdminUser):
    result  = await db.execute(select(Contact).where(Contact.id == uuid.UUID(contact_id)))
    contact = result.scalar_one_or_none()
    if not contact:
        raise HTTPException(status_code=404, detail="Message introuvable.")
    await db.delete(contact)
    await db.commit()
    return {"success": True}


# ── Gestion des témoignages ───────────────────────────────────────────────────
@router.get("/testimonials", response_model=list[TestimonialOut])
async def list_testimonials(db: DB, _: User = AdminUser):
    result = await db.execute(select(Testimonial).order_by(Testimonial.order, Testimonial.id))
    return result.scalars().all()

@router.post("/testimonials", response_model=TestimonialOut, status_code=201)
async def create_testimonial(body: TestimonialCreate, db: DB, _: User = AdminUser):
    t = Testimonial(**body.model_dump())
    db.add(t); await db.commit(); await db.refresh(t)
    return t

@router.put("/testimonials/{tid}", response_model=TestimonialOut)
async def update_testimonial(tid: int, body: TestimonialUpdate, db: DB, _: User = AdminUser):
    result = await db.execute(select(Testimonial).where(Testimonial.id == tid))
    t = result.scalar_one_or_none()
    if not t: raise HTTPException(404, "Témoignage introuvable.")
    for k, v in body.model_dump(exclude_none=True).items(): setattr(t, k, v)
    await db.commit(); await db.refresh(t)
    return t

@router.delete("/testimonials/{tid}")
async def delete_testimonial(tid: int, db: DB, _: User = AdminUser):
    result = await db.execute(select(Testimonial).where(Testimonial.id == tid))
    t = result.scalar_one_or_none()
    if not t: raise HTTPException(404, "Témoignage introuvable.")
    await db.delete(t); await db.commit()
    return {"success": True}


# ── Gestion des plans tarifaires ──────────────────────────────────────────────
@router.get("/pricing", response_model=list[PricingPlanOut])
async def list_pricing(db: DB, _: User = AdminUser):
    result = await db.execute(select(PricingPlan).order_by(PricingPlan.order, PricingPlan.id))
    return result.scalars().all()

@router.post("/pricing", response_model=PricingPlanOut, status_code=201)
async def create_pricing(body: PricingPlanCreate, db: DB, _: User = AdminUser):
    data = body.model_dump()
    data["features"] = json.dumps(data["features"], ensure_ascii=False)
    p = PricingPlan(**data)
    db.add(p); await db.commit(); await db.refresh(p)
    return p

@router.put("/pricing/{pid}", response_model=PricingPlanOut)
async def update_pricing(pid: int, body: PricingPlanUpdate, db: DB, _: User = AdminUser):
    result = await db.execute(select(PricingPlan).where(PricingPlan.id == pid))
    p = result.scalar_one_or_none()
    if not p: raise HTTPException(404, "Plan introuvable.")
    data = body.model_dump(exclude_none=True)
    if "features" in data:
        data["features"] = json.dumps(data["features"], ensure_ascii=False)
    for k, v in data.items(): setattr(p, k, v)
    await db.commit(); await db.refresh(p)
    return p

@router.delete("/pricing/{pid}")
async def delete_pricing(pid: int, db: DB, _: User = AdminUser):
    result = await db.execute(select(PricingPlan).where(PricingPlan.id == pid))
    p = result.scalar_one_or_none()
    if not p: raise HTTPException(404, "Plan introuvable.")
    await db.delete(p); await db.commit()
    return {"success": True}


# ── Gestion des FAQ ───────────────────────────────────────────────────────────
@router.get("/faq", response_model=list[FaqItemOut])
async def list_faq(db: DB, _: User = AdminUser, category: str = None):
    q = select(FaqItem).order_by(FaqItem.category, FaqItem.order, FaqItem.id)
    if category:
        q = q.where(FaqItem.category == category)
    result = await db.execute(q)
    return result.scalars().all()

@router.post("/faq", response_model=FaqItemOut, status_code=201)
async def create_faq(body: FaqItemCreate, db: DB, _: User = AdminUser):
    f = FaqItem(**body.model_dump())
    db.add(f); await db.commit(); await db.refresh(f)
    return f

@router.put("/faq/{fid}", response_model=FaqItemOut)
async def update_faq(fid: int, body: FaqItemUpdate, db: DB, _: User = AdminUser):
    result = await db.execute(select(FaqItem).where(FaqItem.id == fid))
    f = result.scalar_one_or_none()
    if not f: raise HTTPException(404, "FAQ introuvable.")
    for k, v in body.model_dump(exclude_none=True).items(): setattr(f, k, v)
    await db.commit(); await db.refresh(f)
    return f

@router.delete("/faq/{fid}")
async def delete_faq(fid: int, db: DB, _: User = AdminUser):
    result = await db.execute(select(FaqItem).where(FaqItem.id == fid))
    f = result.scalar_one_or_none()
    if not f: raise HTTPException(404, "FAQ introuvable.")
    await db.delete(f); await db.commit()
    return {"success": True}


# ── Gestion des partenaires ───────────────────────────────────────────────────
@router.get("/partners", response_model=list[PartnerOut])
async def list_partners(db: DB, _: User = AdminUser):
    result = await db.execute(select(Partner).order_by(Partner.order, Partner.id))
    return result.scalars().all()

@router.post("/partners", response_model=PartnerOut, status_code=201)
async def create_partner(body: PartnerCreate, db: DB, _: User = AdminUser):
    p = Partner(**body.model_dump())
    db.add(p); await db.commit(); await db.refresh(p)
    return p

@router.put("/partners/{pid}", response_model=PartnerOut)
async def update_partner(pid: int, body: PartnerUpdate, db: DB, _: User = AdminUser):
    result = await db.execute(select(Partner).where(Partner.id == pid))
    p = result.scalar_one_or_none()
    if not p: raise HTTPException(404, "Partenaire introuvable.")
    for k, v in body.model_dump(exclude_none=True).items(): setattr(p, k, v)
    await db.commit(); await db.refresh(p)
    return p

@router.delete("/partners/{pid}")
async def delete_partner(pid: int, db: DB, _: User = AdminUser):
    result = await db.execute(select(Partner).where(Partner.id == pid))
    p = result.scalar_one_or_none()
    if not p: raise HTTPException(404, "Partenaire introuvable.")
    await db.delete(p); await db.commit()
    return {"success": True}


# ── Gestion de la configuration du site ──────────────────────────────────────
@router.get("/config", response_model=list[SiteConfigOut])
async def list_config(db: DB, _: User = AdminUser):
    result = await db.execute(select(SiteConfig).order_by(SiteConfig.key))
    return result.scalars().all()

@router.put("/config/{key}", response_model=SiteConfigOut)
async def update_config(key: str, body: SiteConfigUpdate, db: DB, _: User = AdminUser):
    result = await db.execute(select(SiteConfig).where(SiteConfig.key == key))
    cfg = result.scalar_one_or_none()
    if not cfg:
        raise HTTPException(404, f"Clé de configuration '{key}' introuvable.")
    cfg.value = json.dumps(body.value, ensure_ascii=False)
    if body.label:
        cfg.label = body.label
    await db.commit(); await db.refresh(cfg)
    return cfg


# ── Promote first admin (utilisé une seule fois au démarrage) ────────────────
@router.post("/promote/{user_id}")
async def promote_to_admin(user_id: str, db: DB, current_user: CurrentUser):
    """Promouvoir un utilisateur en admin. Seuls les admins existants peuvent le faire,
    SAUF si c'est le premier admin (aucun admin dans la base)."""
    admin_count = (await db.execute(
        select(func.count()).select_from(User).where(User.role == "admin")
    )).scalar() or 0

    # Si aucun admin n'existe encore → permettre la promotion sans restriction
    if admin_count > 0 and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Réservé aux administrateurs.")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user   = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    user.role = "admin"
    await db.commit()
    return {"success": True, "message": f"{user.email} est maintenant administrateur."}


# ══════════════════════════════════════════════════════════════════════════════
# Routes de gestion des agents personnalisés (admin)
# ══════════════════════════════════════════════════════════════════════════════

from app.models.custom_agent import CustomAgent, BuiltinAgentConfig
from app.schemas.custom_agent import (
    BuiltinAgentConfigOut, BuiltinAgentConfigUpdate,
    CustomAgentOut,
)
from app.services.rag_service import AGENTS_LIST, AGENT_DEFAULT_PROMPTS


@router.get("/agents/builtin", response_model=list[BuiltinAgentConfigOut])
async def admin_list_builtin_agents(db: DB, _: User = AdminUser):
    """Liste tous les agents intégrés avec leurs prompts (DB ou défaut)."""
    # Charger les surcharges DB existantes
    cfg_result = await db.execute(select(BuiltinAgentConfig))
    db_configs = {row.agent_id: row for row in cfg_result.scalars().all()}

    out = []
    for agent in AGENTS_LIST:
        aid = agent["id"]
        db_cfg = db_configs.get(aid)
        out.append(BuiltinAgentConfigOut(
            agent_id      = aid,
            name          = agent["name"],
            description   = agent["description"],
            icon          = agent["icon"],
            category      = agent["category"],
            domain_filter = agent["domain_filter"],
            system_prompt = db_cfg.system_prompt if db_cfg else AGENT_DEFAULT_PROMPTS.get(aid, ""),
            is_db_override= db_cfg is not None,
        ))
    return out


@router.put("/agents/builtin/{agent_id}", response_model=BuiltinAgentConfigOut)
async def admin_update_builtin_agent_prompt(
    agent_id: str, body: BuiltinAgentConfigUpdate,
    db: DB, current_admin: User = AdminUser,
):
    """Met à jour le prompt système d'un agent intégré (crée ou remplace)."""
    known_ids = {a["id"] for a in AGENTS_LIST}
    if agent_id not in known_ids:
        raise HTTPException(status_code=404, detail="Agent intégré introuvable.")

    result = await db.execute(
        select(BuiltinAgentConfig).where(BuiltinAgentConfig.agent_id == agent_id)
    )
    cfg = result.scalar_one_or_none()

    if cfg:
        cfg.system_prompt = body.system_prompt
        cfg.updated_by    = current_admin.email
    else:
        cfg = BuiltinAgentConfig(
            agent_id      = agent_id,
            system_prompt = body.system_prompt,
            updated_by    = current_admin.email,
        )
        db.add(cfg)

    await db.commit()
    await db.refresh(cfg)

    agent_meta = next(a for a in AGENTS_LIST if a["id"] == agent_id)
    return BuiltinAgentConfigOut(
        agent_id      = agent_id,
        name          = agent_meta["name"],
        description   = agent_meta["description"],
        icon          = agent_meta["icon"],
        category      = agent_meta["category"],
        domain_filter = agent_meta["domain_filter"],
        system_prompt = cfg.system_prompt,
        is_db_override= True,
    )


@router.delete("/agents/builtin/{agent_id}")
async def admin_reset_builtin_agent_prompt(agent_id: str, db: DB, _: User = AdminUser):
    """Remet le prompt d'un agent intégré à sa valeur par défaut (supprime la surcharge DB)."""
    result = await db.execute(
        select(BuiltinAgentConfig).where(BuiltinAgentConfig.agent_id == agent_id)
    )
    cfg = result.scalar_one_or_none()
    if cfg:
        await db.delete(cfg)
        await db.commit()
    return {"success": True, "message": "Prompt réinitialisé au défaut."}


@router.get("/agents/custom", response_model=list[dict])
async def admin_list_all_custom_agents(
    db: DB, _: User = AdminUser,
    skip: int = 0, limit: int = 50,
):
    """Liste tous les agents personnalisés de tous les utilisateurs."""
    result = await db.execute(
        select(CustomAgent, User.name, User.email)
        .join(User, CustomAgent.user_id == User.id)
        .order_by(CustomAgent.created_at.desc())
        .offset(skip).limit(limit)
    )
    rows = result.all()
    return [
        {
            "id":            str(r.CustomAgent.id),
            "name":          r.CustomAgent.name,
            "description":   r.CustomAgent.description,
            "system_prompt": r.CustomAgent.system_prompt or "",
            "domains":       r.CustomAgent.domains or [],
            "doc_count":     len(r.CustomAgent.doc_ids or []),
            "user_name":     r.name,
            "user_email":    r.email,
            "created_at":    r.CustomAgent.created_at.isoformat(),
        }
        for r in rows
    ]


@router.put("/agents/custom/{agent_id}")
async def admin_update_custom_agent_prompt(
    agent_id: str, body: BuiltinAgentConfigUpdate,
    db: DB, _: User = AdminUser,
):
    """Met à jour le prompt d'un agent personnalisé (override admin)."""
    result = await db.execute(
        select(CustomAgent).where(CustomAgent.id == uuid.UUID(agent_id))
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent introuvable.")
    agent.system_prompt = body.system_prompt
    await db.commit()
    return {"success": True, "message": "Prompt mis à jour."}


# ══════════════════════════════════════════════════════════════════════════════
# CONVERSATIONS (lecture, suppression)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/conversations")
async def admin_list_conversations(
    db: DB, _: User = AdminUser,
    skip:     int = 0,
    limit:    int = 50,
    user_id:  str | None = Query(default=None),
    agent_id: str | None = Query(default=None),
    q:        str | None = Query(default=None),
):
    """Liste toutes les conversations avec infos utilisateur."""
    stmt = (
        select(Conversation, User.name.label("user_name"), User.email.label("user_email"))
        .join(User, Conversation.user_id == User.id)
        .order_by(Conversation.updated_at.desc())
    )
    if user_id:
        try:
            stmt = stmt.where(Conversation.user_id == uuid.UUID(user_id))
        except ValueError:
            pass
    if agent_id:
        stmt = stmt.where(Conversation.agent_id == agent_id)
    if q:
        stmt = stmt.where(Conversation.title.ilike(f"%{q}%"))

    result = await db.execute(stmt.offset(skip).limit(limit))
    rows = result.all()

    out = []
    for row in rows:
        conv = row.Conversation
        msg_count = (await db.execute(
            select(func.count()).select_from(Message).where(Message.conversation_id == conv.id)
        )).scalar() or 0
        out.append({
            "id":         str(conv.id),
            "title":      conv.title,
            "agent_id":   conv.agent_id,
            "user_id":    str(conv.user_id),
            "user_name":  row.user_name,
            "user_email": row.user_email,
            "msg_count":  msg_count,
            "created_at": conv.created_at.isoformat(),
            "updated_at": conv.updated_at.isoformat(),
        })
    return out


@router.get("/conversations/count")
async def admin_count_conversations(db: DB, _: User = AdminUser):
    total = (await db.execute(select(func.count()).select_from(Conversation))).scalar() or 0
    today = datetime.now(timezone.utc).date()
    today_count = (await db.execute(
        select(func.count()).select_from(Message)
        .where(cast(Message.created_at, Date) == today)
    )).scalar() or 0
    return {"total_conversations": total, "messages_today": today_count}


@router.get("/conversations/{conv_id}/messages")
async def admin_get_conversation_messages(conv_id: str, db: DB, _: User = AdminUser):
    """Retourne tous les messages d'une conversation."""
    try:
        cid = uuid.UUID(conv_id)
    except ValueError:
        raise HTTPException(400, "ID invalide.")

    conv_r = await db.execute(
        select(Conversation, User.name.label("uname"), User.email.label("uemail"))
        .join(User, Conversation.user_id == User.id)
        .where(Conversation.id == cid)
    )
    row = conv_r.first()
    if not row:
        raise HTTPException(404, "Conversation introuvable.")

    msgs_r = await db.execute(
        select(Message).where(Message.conversation_id == cid).order_by(Message.created_at)
    )
    messages = msgs_r.scalars().all()

    return {
        "id":         str(row.Conversation.id),
        "title":      row.Conversation.title,
        "agent_id":   row.Conversation.agent_id,
        "user_name":  row.uname,
        "user_email": row.uemail,
        "created_at": row.Conversation.created_at.isoformat(),
        "messages": [
            {
                "id":         str(m.id),
                "sender":     m.sender,
                "content":    m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ],
    }


@router.delete("/conversations/{conv_id}")
async def admin_delete_conversation(conv_id: str, db: DB, _: User = AdminUser):
    try:
        cid = uuid.UUID(conv_id)
    except ValueError:
        raise HTTPException(400, "ID invalide.")

    conv = (await db.execute(select(Conversation).where(Conversation.id == cid))).scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Conversation introuvable.")
    await db.delete(conv)
    await db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════════════════════
# GESTION QUOTAS & PLANS
# ══════════════════════════════════════════════════════════════════════════════

# ══════════════════════════════════════════════════════════════════════════════
# ABONNEMENTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/subscriptions")
async def admin_list_subscriptions(
    db: DB, _: User = AdminUser,
    skip: int = 0, limit: int = 100,
    status_filter: str | None = Query(default=None),
    plan_filter:   str | None = Query(default=None),
):
    stmt = (
        select(Subscription, User.name.label("uname"), User.email.label("uemail"))
        .join(User, Subscription.user_id == User.id)
        .order_by(Subscription.created_at.desc())
    )
    if status_filter:
        stmt = stmt.where(Subscription.status == status_filter)
    if plan_filter:
        stmt = stmt.where(Subscription.plan_id == plan_filter)

    result = await db.execute(stmt.offset(skip).limit(limit))
    rows = result.all()

    return [
        {
            "id":             str(r.Subscription.id),
            "user_id":        str(r.Subscription.user_id),
            "user_name":      r.uname,
            "user_email":     r.uemail,
            "plan_id":        r.Subscription.plan_id,
            "status":         r.Subscription.status,
            "payment_method": r.Subscription.payment_method,
            "renewal_date":   r.Subscription.renewal_date.isoformat() if r.Subscription.renewal_date else None,
            "created_at":     r.Subscription.created_at.isoformat(),
        }
        for r in rows
    ]


# ══════════════════════════════════════════════════════════════════════════════
# MODÉRATION (blacklist, règles de contenu)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/moderation")
async def admin_list_moderation_rules(db: DB, _: User = AdminUser):
    result = await db.execute(select(ModerationRule).order_by(ModerationRule.created_at.desc()))
    rules = result.scalars().all()
    return [
        {
            "id":          r.id,
            "type":        r.type,
            "pattern":     r.pattern,
            "description": r.description,
            "is_active":   r.is_active,
            "created_at":  r.created_at.isoformat(),
            "created_by":  r.created_by,
        }
        for r in rules
    ]


@router.post("/moderation", status_code=201)
async def admin_create_moderation_rule(
    db: DB,
    current_admin: User = AdminUser,
    type:        str = Query(...),
    pattern:     str = Query(...),
    description: str = Query(default=""),
):
    rule = ModerationRule(
        type=type, pattern=pattern, description=description,
        created_by=current_admin.email,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {"id": rule.id, "type": rule.type, "pattern": rule.pattern, "description": rule.description, "is_active": rule.is_active}


@router.patch("/moderation/{rule_id}/toggle")
async def admin_toggle_moderation_rule(rule_id: int, db: DB, _: User = AdminUser):
    rule = (await db.execute(select(ModerationRule).where(ModerationRule.id == rule_id))).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Règle introuvable.")
    rule.is_active = not rule.is_active
    await db.commit()
    return {"id": rule.id, "is_active": rule.is_active}


@router.delete("/moderation/{rule_id}")
async def admin_delete_moderation_rule(rule_id: int, db: DB, _: User = AdminUser):
    rule = (await db.execute(select(ModerationRule).where(ModerationRule.id == rule_id))).scalar_one_or_none()
    if not rule:
        raise HTTPException(404, "Règle introuvable.")
    await db.delete(rule)
    await db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════════════════════
# MODE MAINTENANCE & PARAMÈTRES SYSTÈME
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/system")
async def admin_get_system_config(db: DB, _: User = AdminUser):
    keys = ["maintenance", "announcement", "global_limits"]
    result = await db.execute(select(SiteConfig).where(SiteConfig.key.in_(keys)))
    rows = {r.key: json.loads(r.value) for r in result.scalars().all()}
    return {
        "maintenance":    rows.get("maintenance",    {"enabled": False, "message": ""}),
        "announcement":   rows.get("announcement",   {"enabled": False, "message": "", "type": "info"}),
        "global_limits":  rows.get("global_limits",  {"max_questions_free": 5, "max_questions_basic": 10, "max_questions_pro": -1}),
    }


async def _upsert_config(db, key: str, label: str, value: dict):
    existing = (await db.execute(select(SiteConfig).where(SiteConfig.key == key))).scalar_one_or_none()
    if existing:
        existing.value = json.dumps(value, ensure_ascii=False)
    else:
        db.add(SiteConfig(key=key, label=label, value=json.dumps(value, ensure_ascii=False)))


@router.put("/system/maintenance")
async def admin_set_maintenance(
    db: DB, _: User = AdminUser,
    enabled: bool = Query(...),
    message: str  = Query(default="Maintenance en cours. Retour prévu dans quelques minutes."),
):
    await _upsert_config(db, "maintenance", "Mode maintenance", {"enabled": enabled, "message": message})
    await db.commit()
    return {"success": True, "enabled": enabled}


@router.put("/system/announcement")
async def admin_set_announcement(
    db: DB, _: User = AdminUser,
    enabled: bool = Query(default=False),
    message: str  = Query(default=""),
    type:    str  = Query(default="info"),  # info | warning | success | danger
):
    await _upsert_config(db, "announcement", "Annonce globale", {"enabled": enabled, "message": message, "type": type})
    await db.commit()
    return {"success": True}


@router.put("/system/global-limits")
async def admin_set_global_limits(
    db: DB, _: User = AdminUser,
    max_free:       int = Query(default=5),
    max_basic:      int = Query(default=10),
    max_pro:        int = Query(default=-1),
    max_enterprise: int = Query(default=-1),
):
    await _upsert_config(db, "global_limits", "Limites globales quotas", {
        "max_questions_free":       max_free,
        "max_questions_basic":      max_basic,
        "max_questions_pro":        max_pro,
        "max_questions_enterprise": max_enterprise,
    })
    await db.commit()
    return {"success": True}


# ══════════════════════════════════════════════════════════════════════════════
# EXPORT CSV
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/export/users")
async def admin_export_users_csv(db: DB, _: User = AdminUser):
    """Exporte tous les utilisateurs en CSV."""
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    users = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id","email","name","role","auth_provider","is_active","is_verified","profession","created_at","last_login"])
    for u in users:
        writer.writerow([
            str(u.id), u.email, u.name, u.role, u.auth_provider,
            u.is_active, u.is_verified, u.profession or "",
            u.created_at.isoformat(), u.last_login.isoformat() if u.last_login else "",
        ])

    output.seek(0)
    headers = {"Content-Disposition": "attachment; filename=justicia_users.csv"}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


@router.get("/export/conversations")
async def admin_export_conversations_csv(db: DB, _: User = AdminUser):
    """Exporte toutes les conversations (sans le contenu des messages) en CSV."""
    result = await db.execute(
        select(Conversation, User.email.label("uemail"))
        .join(User, Conversation.user_id == User.id)
        .order_by(Conversation.created_at.desc())
    )
    rows = result.all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["id","user_email","title","agent_id","created_at","updated_at"])
    for r in rows:
        c = r.Conversation
        writer.writerow([
            str(c.id), r.uemail, c.title, c.agent_id,
            c.created_at.isoformat(), c.updated_at.isoformat(),
        ])

    output.seek(0)
    headers = {"Content-Disposition": "attachment; filename=justicia_conversations.csv"}
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers=headers)


# ══════════════════════════════════════════════════════════════════════════════
# LOGS D'ACTIVITÉ ADMIN (utilisateurs les plus actifs, alertes)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/activity/top-users")
async def admin_top_users(db: DB, _: User = AdminUser, days: int = 7, limit: int = 20):
    """Top utilisateurs par nombre de questions sur les N derniers jours."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(User.id, User.name, User.email, func.count(Message.id).label("msg_count"))
        .join(Conversation, Conversation.user_id == User.id)
        .join(Message, Message.conversation_id == Conversation.id)
        .where(Message.sender == "user", Message.created_at >= since)
        .group_by(User.id, User.name, User.email)
        .order_by(func.count(Message.id).desc())
        .limit(limit)
    )
    return [
        {"user_id": str(r.id), "name": r.name, "email": r.email, "questions": r.msg_count}
        for r in result.all()
    ]


@router.get("/activity/recent-logins")
async def admin_recent_logins(db: DB, _: User = AdminUser, limit: int = 20):
    """Utilisateurs connectés récemment."""
    result = await db.execute(
        select(User).where(User.last_login.isnot(None))
        .order_by(User.last_login.desc()).limit(limit)
    )
    return [
        {
            "id":         str(u.id),
            "name":       u.name,
            "email":      u.email,
            "last_login": u.last_login.isoformat(),
            "is_active":  u.is_active,
            "role":       u.role,
        }
        for u in result.scalars().all()
    ]


@router.get("/activity/quota-alerts")
async def admin_quota_alerts(db: DB, _: User = AdminUser):
    """Utilisateurs ayant atteint 80%+ de leur quota journalier."""
    result = await db.execute(
        select(User, UserStats)
        .join(UserStats, UserStats.user_id == User.id)
        .where(UserStats.daily_questions_count > 3)
        .order_by(UserStats.daily_questions_count.desc())
        .limit(50)
    )
    return [
        {
            "user_id":       str(r.User.id),
            "name":          r.User.name,
            "email":         r.User.email,
            "questions_used": r.UserStats.daily_questions_count,
            "reset_date":    str(r.UserStats.daily_reset_date) if r.UserStats.daily_reset_date else None,
        }
        for r in result.all()
    ]

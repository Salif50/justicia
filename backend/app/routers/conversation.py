import uuid
import logging
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from sqlalchemy import func, select, exists
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.content import PricingPlan
from app.models.conversation import Conversation, Message
from app.models.custom_agent import CustomAgent, BuiltinAgentConfig
from app.models.subscription import Subscription
from app.models.user import UserPreferences, UserStats
from app.schemas.conversation import (ConversationOut, ConversationSummary,
                                       SendMessageRequest, SendMessageResponse)
from app.services import assistant
from app.services.assistant import Kind
from app.services.quota import resolve_quota
from app.services.rag_service import (AGENT_DOMAIN_MAP, AGENT_NAMES,
                                       AGENT_DEFAULT_PROMPTS, ask_rag, format_sources,
                                       is_no_source_answer, is_unverified_answer)

DEFAULT_TITLE = "Nouvelle consultation"

router = APIRouter(prefix="/conversation", tags=["Conversation"])


async def _get_or_create_stats(user_id, db) -> UserStats:
    """Récupère ou crée les stats utilisateur."""
    result = await db.execute(select(UserStats).where(UserStats.user_id == user_id))
    stats = result.scalar_one_or_none()
    if not stats:
        stats = UserStats(user_id=user_id)
        db.add(stats)
        await db.flush()
    return stats


async def _check_daily_limit(current_user, db) -> None:
    """Vérifie la limite journalière et lève une 429 si atteinte."""
    # Les admins ont un accès illimité
    if getattr(current_user, "role", None) == "admin":
        return

    stats = await _get_or_create_stats(current_user.id, db)

    # Réinitialiser le compteur journalier si nouveau jour
    today = date.today()
    if stats.daily_reset_date != today:
        stats.daily_questions_count = 0
        stats.daily_reset_date = today

    quota = await resolve_quota(current_user, db, stats)
    if quota.is_unlimited:
        return

    if stats.daily_questions_count >= quota.daily_limit:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "DAILY_LIMIT_REACHED",
                "message": (
                    f"Vous avez atteint votre limite de {quota.daily_limit} question(s) "
                    f"par jour pour le plan {quota.plan_name}. "
                    f"Passez à un plan supérieur pour continuer."
                ),
                "daily_limit": quota.daily_limit,
                "questions_today": stats.daily_questions_count,
                "plan_id": quota.plan_id,
                "is_free_tier": quota.is_free_tier,
            },
        )


@router.post("/send", response_model=SendMessageResponse)
async def send_message(body: SendMessageRequest, current_user: CurrentUser, db: DB):
    """Envoie un message, vérifie le quota, appelle le RAG.
    Si mode éphémère actif : aucune sauvegarde en BDD.

    Les messages non juridiques (salutation, remerciement, question sur JusticIA,
    hors sujet) reçoivent une réponse d'accueil. Tout message compte dans le quota
    (y compris les salutations), sauf en cas d'erreur technique.
    """
    kind = assistant.classify(body.message) or Kind.LEGAL

    # ── Vérification quota journalier (tous les messages) ────────────────────
    await _check_daily_limit(current_user, db)

    # ── Vérifier le mode éphémère ────────────────────────────────────────────
    prefs_result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = prefs_result.scalar_one_or_none()
    is_ephemeral = prefs.ephemeral_mode if prefs else False
    request_id = str(uuid.uuid4())
    logger = logging.getLogger("justicia.conversation")
    logger.info(
        "rag_request_start request_id=%s agent=%s ephemeral=%s",
        request_id, body.agent_id, is_ephemeral,
    )

    # ── Résolution de l'agent (intégré ou personnalisé) ──────────────────────
    custom_domains = None
    agent_system_prompt: Optional[str] = None
    agent_display_name = AGENT_NAMES.get(body.agent_id, "JusticIA")

    if body.agent_id in AGENT_DOMAIN_MAP:
        # Agent intégré : chercher un prompt admin en DB, sinon utiliser le défaut
        builtin_cfg = await db.execute(
            select(BuiltinAgentConfig).where(BuiltinAgentConfig.agent_id == body.agent_id)
        )
        builtin_row = builtin_cfg.scalar_one_or_none()
        if builtin_row:
            agent_system_prompt = builtin_row.system_prompt
        else:
            agent_system_prompt = AGENT_DEFAULT_PROMPTS.get(body.agent_id)
    else:
        # Chercher dans les agents personnalisés de l'utilisateur
        try:
            custom_result = await db.execute(
                select(CustomAgent).where(
                    CustomAgent.id == uuid.UUID(body.agent_id),
                    CustomAgent.user_id == current_user.id,
                )
            )
            custom_agent_obj = custom_result.scalar_one_or_none()
            if custom_agent_obj:
                custom_domains = custom_agent_obj.domains or []
                agent_display_name = custom_agent_obj.name
                # Prompt personnalisé : base + instructions utilisateur
                user_instructions = (custom_agent_obj.system_prompt or "").strip()
                if user_instructions:
                    base = AGENT_DEFAULT_PROMPTS.get("jurisprudence", "")
                    agent_system_prompt = base + f"\n\n## Instructions spécifiques de cet agent\n\n{user_instructions}"
                else:
                    agent_system_prompt = AGENT_DEFAULT_PROMPTS.get("jurisprudence")
        except (ValueError, Exception):
            pass

    # ── Charger l'historique récent de la conversation ───────────────────────
    conversation_history: list[dict] = []
    history_kinds: list[str | None] = []      # nature des réponses du bot (pour la série d'accueil)
    message_kinds: list[str | None] = []      # nature de chaque message de l'historique
    if body.conversation_id:
        try:
            conv_uuid = uuid.UUID(body.conversation_id)
            hist_result = await db.execute(
                select(Message)
                .where(
                    Message.conversation_id == conv_uuid,
                    Message.conversation_id.in_(
                        select(Conversation.id).where(Conversation.user_id == current_user.id)
                    ),
                )
                .order_by(Message.created_at.desc())
                .limit(10)
            )
            recent_messages = list(reversed(hist_result.scalars().all()))
            conversation_history = [
                {"role": "user" if m.sender == "user" else "assistant", "content": m.content}
                for m in recent_messages
            ]
            history_kinds = [m.kind for m in recent_messages if m.sender == "bot"]
            message_kinds = [m.kind for m in recent_messages]
        except (ValueError, Exception):
            conversation_history = []

    streak = assistant.conversational_streak(history_kinds)
    technical_error = False

    rag_history = [h for h, k in zip(conversation_history, message_kinds or [None] * len(conversation_history))
                   if k not in Kind.CONVERSATIONAL]

    # ── Analyse de la question (modèle rapide) : nature, reformulation juridique ─
    triage = None
    if kind not in Kind.CONVERSATIONAL:
        triage = await assistant.triage(body.message, rag_history)
        if triage and triage.kind != Kind.LEGAL:
            kind = triage.kind

    if kind in Kind.CONVERSATIONAL:
        # ── Accueil : salutation, remerciement, question sur JusticIA, hors sujet ─
        response_text = await assistant.reply(
            kind, body.message, streak, db, current_user.name, conversation_history,
        )
        sources = []
    elif kind == Kind.CLARIFY:
        # ── Sujet impossible à cerner : questions de précision, sans recherche ───
        response_text = assistant.clarify_reply(triage, current_user.name)
        sources = []
    else:
        # ── Recherche dans les textes (RAG), orientée par la reformulation juridique ─
        try:
            response_text, articles = await ask_rag(
                body.message,
                agent_id      = body.agent_id,
                custom_domains= custom_domains,
                history       = rag_history,
                system_prompt = agent_system_prompt,
                request_id    = request_id,
                search_hint   = triage.search_query if triage else None,
            )
            sources = format_sources(articles)
        except Exception as e:
            logger.error(
                "rag_request_error request_id=%s error=%s",
                request_id, type(e).__name__, exc_info=True,
            )
            response_text = "Une erreur est survenue lors de l'analyse. Veuillez réessayer."
            sources       = []
            technical_error = True

        if is_no_source_answer(response_text) or is_unverified_answer(response_text):
            # Aucun article ne confirme la réponse : accompagnement humain plutôt qu'un refus sec
            response_text = await assistant.support_reply(body.message, triage, rag_history)
            sources = []
        elif triage and triage.sensitive and sources and not technical_error:
            # Situation difficile : quelques mots humains et les premiers réflexes avant les textes
            response_text = f"{await assistant.sensitive_preface(body.message)}\n\n{response_text}"

    # Tout message consomme le quota (anti-gaspillage), sauf une erreur technique de notre côté
    counted = not technical_error
    logger.info("chat_turn request_id=%s kind=%s streak=%s counted=%s", request_id, kind, streak, counted)

    if is_ephemeral:
        # ── Mode éphémère : incrémentation quota UNIQUEMENT, aucune sauvegarde ─
        if counted:
            stats = await _get_or_create_stats(current_user.id, db)
            stats.questions_count       += 1
            stats.daily_questions_count += 1
            await db.commit()

        logger.info("rag_request_end request_id=%s sources=%s ephemeral=true", request_id, len(sources))
        return SendMessageResponse(
            id="ephemeral-" + str(uuid.uuid4()),
            content=response_text,
            sources=sources,
            conversation_id=None,
            created_at=datetime.now(timezone.utc),
            ephemeral=True,
            kind=kind,
            counted=counted,
        )

    # ── Mode normal : sauvegarde en BDD ──────────────────────────────────────

    # Récupérer ou créer la conversation
    conv = None
    if body.conversation_id:
        result = await db.execute(
            select(Conversation).where(
                Conversation.id == uuid.UUID(body.conversation_id),
                Conversation.user_id == current_user.id,
            )
        )
        conv = result.scalar_one_or_none()

    question_title = body.message[:60] + ("..." if len(body.message) > 60 else "")
    is_new_conv = False
    if not conv:
        # Une conversation ouverte par « bonjour » prend le titre de la 1re vraie question
        title = question_title if kind == Kind.LEGAL else DEFAULT_TITLE
        conv  = Conversation(
            user_id=current_user.id,
            agent_id=body.agent_id,
            ai_name=agent_display_name,
            title=title,
        )
        db.add(conv)
        await db.flush()
        is_new_conv = True

    # Sauvegarder les messages
    if kind == Kind.LEGAL and conv.title == DEFAULT_TITLE:
        conv.title = question_title
    user_msg = Message(conversation_id=conv.id, content=body.message, sender="user", kind=kind)
    bot_msg  = Message(conversation_id=conv.id, content=response_text, sender="bot", sources=sources, kind=kind)
    db.add(user_msg)
    db.add(bot_msg)

    conv.updated_at = datetime.now(timezone.utc)

    # Mettre à jour les stats
    stats = await _get_or_create_stats(current_user.id, db)
    if counted:
        stats.questions_count       += 1
        stats.daily_questions_count += 1
    if is_new_conv:
        stats.conversations_count += 1

    await db.commit()
    await db.refresh(bot_msg)

    logger.info("rag_request_end request_id=%s sources=%s ephemeral=false", request_id, len(sources))
    return SendMessageResponse(
        id=str(bot_msg.id),
        content=bot_msg.content,
        sources=sources,
        conversation_id=str(conv.id),
        created_at=bot_msg.created_at,
        ephemeral=False,
        kind=kind,
        counted=counted,
    )


@router.get("/history", response_model=list[ConversationSummary])
async def get_history(current_user: CurrentUser, db: DB):
    """Retourne toutes les conversations de l'utilisateur (sans les messages)."""
    result = await db.execute(
        select(Conversation)
        .where(Conversation.user_id == current_user.id)
        .order_by(Conversation.updated_at.desc())
    )
    conversations = result.scalars().all()

    summaries = []
    for conv in conversations:
        count_result = await db.execute(
            select(func.count()).where(Message.conversation_id == conv.id)
        )
        msg_count = count_result.scalar() or 0
        summaries.append(ConversationSummary(
            id=str(conv.id), title=conv.title, agent_id=conv.agent_id,
            ai_name=conv.ai_name, created_at=conv.created_at,
            updated_at=conv.updated_at, message_count=msg_count,
        ))
    return summaries


@router.get("/{conversation_id}", response_model=ConversationOut)
async def get_conversation(conversation_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .where(Conversation.id == uuid.UUID(conversation_id), Conversation.user_id == current_user.id)
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation introuvable.")
    return ConversationOut.model_validate(conv)


@router.delete("/{conversation_id}")
async def delete_conversation(conversation_id: str, current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Conversation).where(
            Conversation.id == uuid.UUID(conversation_id),
            Conversation.user_id == current_user.id,
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation introuvable.")

    await db.delete(conv)

    stats = await _get_or_create_stats(current_user.id, db)
    if stats.conversations_count > 0:
        stats.conversations_count -= 1

    await db.commit()
    return {"success": True}

"""
Modération des comptes : suspensions temporaires et information de l'utilisateur.

- Une suspension peut avoir une échéance (users.blocked_until). Elle est levée
  automatiquement dès que l'échéance est passée : à la connexion de l'utilisateur,
  à chaque requête authentifiée, et lors de la consultation de la liste admin.
- Chaque décision qui concerne l'utilisateur peut lui être signalée par une
  notification dans l'application et par e-mail (voir app/services/mailer.py).
"""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select

from app.config import settings
from app.models.moderation import AdminAuditLog
from app.models.notification import Notification
from app.models.user import User
from app.services.mailer import send_email

logger = logging.getLogger("justicia.moderation")

_MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet",
           "août", "septembre", "octobre", "novembre", "décembre"]


def format_date(d: datetime) -> str:
    """« 12 octobre 2026 à 14:30 » (heure UTC — fuseau de Conakry)."""
    d = d.astimezone(timezone.utc)
    return f"{d.day} {_MONTHS[d.month - 1]} {d.year} à {d:%H:%M}"


def blocked_message(user: User) -> str:
    """Message affiché à un compte suspendu qui tente de se connecter."""
    base = "Votre compte a été suspendu par l'administration de JusticIA"
    until = getattr(user, "blocked_until", None)
    base += f" jusqu'au {format_date(until)}." if until else "."
    reason = (getattr(user, "blocked_reason", None) or "").strip()
    return f"{base} Motif : {reason}" if reason else base


def _clear_suspension(user: User) -> None:
    user.is_active = True
    user.blocked_reason = None
    user.blocked_at = None
    user.blocked_until = None


async def lift_if_expired(user: User, db) -> bool:
    """Réactive l'utilisateur si sa suspension temporaire est échue. Commit inclus."""
    until = getattr(user, "blocked_until", None)
    if user.is_active or not until or until > datetime.now(timezone.utc):
        return False
    await _auto_unblock(db, user)
    await db.commit()
    return True


async def lift_expired_suspensions(db) -> int:
    """Réactive tous les comptes dont la suspension temporaire est échue. Commit inclus."""
    expired = (await db.execute(
        select(User).where(
            User.is_active.is_(False),
            User.blocked_until.is_not(None),
            User.blocked_until <= datetime.now(timezone.utc),
        )
    )).scalars().all()
    for user in expired:
        await _auto_unblock(db, user)
    if expired:
        await db.commit()
    return len(expired)


async def _auto_unblock(db, user: User) -> None:
    reason = user.blocked_reason
    _clear_suspension(user)
    db.add(AdminAuditLog(
        admin_id="system", admin_email="système (échéance)",
        target_user_id=str(user.id), target_email=user.email,
        action="auto_unblock", details={"reason": reason},
    ))
    await notify_user(db, user, "unblock", email=True)
    logger.info("suspension_expired user=%s", user.email)


# ── Messages envoyés à l'utilisateur ─────────────────────────────────────────

def _limit_text(limit: int) -> str:
    return "un nombre illimité de questions" if limit == -1 else f"{limit} question{'s' if limit > 1 else ''}"


def _compose(user: User, event: str, ctx: dict) -> tuple[str, list[str], str, str | None]:
    """Retourne (titre, paragraphes, type de notification, lien relatif)."""
    first = (user.name or "").split(" ")[0] or "Bonjour"
    hello = f"Bonjour {first},"

    if event == "quota":
        if ctx.get("override") is None:
            body = f"Votre quota journalier suit de nouveau celui de votre formule : {_limit_text(ctx['limit'])} par jour."
        else:
            body = f"Votre quota journalier a été ajusté : vous pouvez désormais poser {_limit_text(ctx['limit'])} par jour."
        return "Votre quota journalier a changé", [hello, body], "info", "/dashboard/subscription"

    if event == "quota_reset":
        return ("Votre compteur du jour a été remis à zéro",
                [hello, "Un administrateur a remis votre compteur de questions du jour à zéro. Vous pouvez de nouveau poser des questions dès maintenant."],
                "success", "/dashboard/chat")

    if event == "plan":
        if ctx["plan_id"] == "gratuit":
            body = "Votre compte est repassé à la formule Gratuite."
        else:
            body = f"Vous bénéficiez désormais de la formule {ctx['plan_name']}"
            body += f" jusqu'au {format_date(ctx['until'])}." if ctx.get("until") else "."
        return "Votre formule a changé", [hello, body], "success", "/dashboard/subscription"

    if event == "block":
        lines = [hello]
        if ctx.get("until"):
            lines.append(f"Votre compte JusticIA est suspendu jusqu'au {format_date(ctx['until'])}. Il sera réactivé automatiquement à cette date.")
        else:
            lines.append("Votre compte JusticIA a été suspendu.")
        if ctx.get("reason"):
            lines.append(f"Motif : {ctx['reason']}")
        lines.append("Si vous pensez qu'il s'agit d'une erreur, répondez via le formulaire de contact du site.")
        return "Votre compte a été suspendu", lines, "warning", None

    if event == "unblock":
        return ("Votre compte est de nouveau actif",
                [hello, "Votre compte JusticIA a été réactivé. Vous pouvez vous reconnecter et reprendre vos consultations."],
                "success", "/dashboard")

    if event == "role_admin":
        return ("Vous êtes administrateur",
                [hello, "Des droits d'administration vous ont été attribués sur JusticIA."],
                "system", "/admin")

    raise ValueError(f"événement inconnu : {event}")


async def notify_user(db, user: User, event: str, email: bool = True, **ctx) -> None:
    """Crée la notification in-app (commit à la charge de l'appelant) et envoie l'e-mail en arrière-plan."""
    title, paragraphs, kind, link = _compose(user, event, ctx)
    # Notification in-app : sans la formule de politesse, déjà implicite dans l'interface
    db.add(Notification(user_id=user.id, type=kind, title=title,
                        message=" ".join(paragraphs[1:]), link=link))
    if email:
        base = (settings.APP_PUBLIC_FRONTEND_URL or settings.FRONTEND_URL).rstrip("/")
        cta = ("Ouvrir JusticIA", f"{base}{link}") if link else ("Nous contacter", f"{base}/support")
        asyncio.create_task(send_email(user.email, f"JusticIA — {title}", title, paragraphs, cta))

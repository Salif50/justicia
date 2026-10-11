"""Protection anti-robots des formulaires publics (inscription, contact).

Trois couches, de la plus simple à la plus forte :
1. Champ piège (« honeypot ») invisible pour un humain : un robot le remplit.
2. Délai minimal de remplissage : un humain met plus de 2,5 s à remplir le formulaire.
3. Cloudflare Turnstile (facultatif) : actif dès que TURNSTILE_SECRET_KEY est défini.
Le rate limiting par IP (security_middleware) complète le dispositif.
"""
import logging

import httpx

from app.config import settings

logger = logging.getLogger("justicia.antibot")

MIN_FILL_MS = 2500
TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def looks_automated(honeypot: str | None, elapsed_ms: int | None) -> bool:
    """True si la soumission ressemble à un robot (champ piège rempli, envoi éclair)."""
    if honeypot and honeypot.strip():
        return True
    return elapsed_ms is not None and 0 <= elapsed_ms < MIN_FILL_MS


def turnstile_enabled() -> bool:
    return bool(settings.TURNSTILE_SECRET_KEY)


async def verify_turnstile(token: str | None, remote_ip: str | None) -> bool:
    """Vérifie le jeton Turnstile auprès de Cloudflare. Toujours vrai si désactivé."""
    if not turnstile_enabled():
        return True
    if not token:
        return False
    data = {"secret": settings.TURNSTILE_SECRET_KEY, "response": token}
    if remote_ip:
        data["remoteip"] = remote_ip
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.post(TURNSTILE_URL, data=data)
        ok = bool(resp.json().get("success"))
    except Exception as exc:  # noqa: BLE001
        # Cloudflare injoignable : on refuse plutôt que d'ouvrir la porte aux robots
        logger.warning("turnstile_unreachable error=%s", exc)
        return False
    if not ok:
        logger.info("turnstile_rejected ip=%s", remote_ip)
    return ok

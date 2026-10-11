"""
Middleware de sécurité JusticIA.
- En-têtes HTTP sécurisés sur toutes les réponses
- Rate limiting simple en mémoire sur les routes d'authentification
- Validation de la force du mot de passe
"""
import time
from collections import defaultdict
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


# ── Security Headers Middleware ───────────────────────────────────────────────
class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Ajoute les en-têtes de sécurité HTTP à chaque réponse."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)

        # Protection MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"
        # Interdire l'intégration dans une iframe (clickjacking)
        response.headers["X-Frame-Options"] = "DENY"
        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"
        # Politique de référant
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        # Désactiver les fonctionnalités sensibles du navigateur
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=(), usb=()"
        )
        # Empêcher la mise en cache des réponses API sensibles
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"

        return response


# ── Rate Limiter simple en mémoire ────────────────────────────────────────────
class InMemoryRateLimiter:
    """
    Rate limiter basé sur l'IP.
    Stockage en mémoire (non distribué — adapter avec Redis pour la prod multi-instance).
    """

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests     = max_requests
        self.window_seconds   = window_seconds
        self._store: dict     = defaultdict(list)

    def is_allowed(self, key: str) -> bool:
        now = time.time()
        window_start = now - self.window_seconds

        # Purger les entrées expirées
        self._store[key] = [t for t in self._store[key] if t > window_start]

        if len(self._store[key]) >= self.max_requests:
            return False

        self._store[key].append(now)
        return True

    def remaining(self, key: str) -> int:
        now = time.time()
        window_start = now - self.window_seconds
        recent = [t for t in self._store[key] if t > window_start]
        return max(0, self.max_requests - len(recent))


# Instances de rate limiters par contexte
auth_limiter    = InMemoryRateLimiter(max_requests=10,  window_seconds=60)   # 10 tentatives/min
signup_limiter  = InMemoryRateLimiter(max_requests=5,   window_seconds=300)  # 5 inscriptions/5 min
api_limiter     = InMemoryRateLimiter(max_requests=100, window_seconds=60)   # 100 req/min général
# Formulaires publics sensibles aux robots
sensitive_limiter = InMemoryRateLimiter(max_requests=5, window_seconds=600)  # 5 envois/10 min
SENSITIVE_PATHS = {
    "/api/auth/resend-verification": "Trop de demandes de lien. Réessayez dans quelques minutes.",
    "/api/auth/verify-email":        "Trop de tentatives. Réessayez dans quelques minutes.",
    "/api/auth/forgot-password":     "Trop de demandes. Réessayez dans quelques minutes.",
    "/api/auth/reset-password":      "Trop de tentatives. Réessayez dans quelques minutes.",
    "/api/contact":                  "Trop de messages envoyés. Réessayez dans quelques minutes.",
    "/api/contact/send":             "Trop de messages envoyés. Réessayez dans quelques minutes.",
}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Applique le rate limiting sur les routes d'authentification."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        path      = request.url.path

        # Rate limiting strict sur les routes d'auth
        if path in ("/api/auth/login", "/api/auth/google"):
            if not auth_limiter.is_allowed(f"auth:{client_ip}"):
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Trop de tentatives de connexion. Réessayez dans 1 minute.",
                        "code": "RATE_LIMIT_AUTH",
                    },
                )

        elif path == "/api/auth/signup":
            if not signup_limiter.is_allowed(f"signup:{client_ip}"):
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Trop d'inscriptions depuis cette adresse IP. Réessayez dans 5 minutes.",
                        "code": "RATE_LIMIT_SIGNUP",
                    },
                )

        elif path in SENSITIVE_PATHS and request.method == "POST":
            if not sensitive_limiter.is_allowed(f"{path}:{client_ip}"):
                return JSONResponse(
                    status_code=429,
                    content={"detail": SENSITIVE_PATHS[path], "code": "RATE_LIMIT_FORM"},
                )

        # Rate limiting général sur toute l'API
        elif path.startswith("/api/"):
            if not api_limiter.is_allowed(f"api:{client_ip}"):
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Trop de requêtes. Veuillez ralentir.",
                        "code": "RATE_LIMIT_API",
                    },
                )

        response = await call_next(request)

        # Ajouter les headers de rate limit restants
        if path.startswith("/api/auth/"):
            response.headers["X-RateLimit-Remaining"] = str(
                auth_limiter.remaining(f"auth:{client_ip}")
            )

        return response


# ── Validation force du mot de passe ─────────────────────────────────────────
def validate_password_strength(password: str) -> list[str]:
    """
    Retourne une liste d'erreurs si le mot de passe est trop faible.
    Retourne une liste vide si le mot de passe est acceptable.
    """
    errors = []

    if len(password) < 8:
        errors.append("Le mot de passe doit contenir au moins 8 caractères.")

    if not any(c.isupper() for c in password):
        errors.append("Le mot de passe doit contenir au moins une lettre majuscule.")

    if not any(c.islower() for c in password):
        errors.append("Le mot de passe doit contenir au moins une lettre minuscule.")

    if not any(c.isdigit() for c in password):
        errors.append("Le mot de passe doit contenir au moins un chiffre.")

    # Liste de mots de passe trop communs
    common = {"password", "123456", "azerty", "qwerty", "justicia", "admin", "guinee"}
    if password.lower() in common:
        errors.append("Ce mot de passe est trop simple et facilement devinable.")

    return errors

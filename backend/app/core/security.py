from datetime import datetime, timedelta, timezone

import bcrypt
from jose import JWTError, jwt

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    return jwt.encode({"sub": subject, "exp": expire, "type": "access"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token(subject: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": subject, "exp": expire, "type": "refresh"}, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> str | None:
    """Renvoie l'identifiant de l'utilisateur si le jeton est valide ET du bon type.

    Sans ce contrôle, un jeton de rafraîchissement (7 jours) servirait de jeton
    d'accès, et un jeton d'accès permettrait de se réémettre des sessions.
    Les jetons d'accès émis avant l'ajout du champ « type » restent acceptés.
    """
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    token_type = payload.get("type")
    if expected_type == "access":
        if token_type not in (None, "access"):
            return None
    elif token_type != expected_type:
        return None
    return payload.get("sub")


# ── Lien de confirmation d'adresse e-mail ─────────────────────────────────────
EMAIL_TOKEN_HOURS = 48


def create_email_verification_token(user_id: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=EMAIL_TOKEN_HOURS)
    return jwt.encode(
        {"uid": user_id, "email": email.lower(), "exp": expire, "type": "email_verify"},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM,
    )


def decode_email_verification_token(token: str) -> tuple[str, str] | None:
    """(user_id, email) si le lien est valide. Pas de « sub » : ce jeton ne peut
    jamais être confondu avec un jeton de session."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "email_verify" or not payload.get("uid") or not payload.get("email"):
        return None
    return payload["uid"], payload["email"]


# ── Lien de réinitialisation du mot de passe ──────────────────────────────────
RESET_TOKEN_MINUTES = 60


def _password_fingerprint(password_hash: str | None) -> str:
    """Empreinte du mot de passe actuel : le lien devient invalide dès qu'il change
    (usage unique) et il ne révèle rien du hash."""
    import hashlib
    return hashlib.sha256(f"{settings.SECRET_KEY}:{password_hash or ''}".encode()).hexdigest()[:16]


def create_password_reset_token(user_id: str, password_hash: str | None) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_MINUTES)
    return jwt.encode(
        {"uid": user_id, "pwf": _password_fingerprint(password_hash), "exp": expire, "type": "password_reset"},
        settings.SECRET_KEY, algorithm=settings.ALGORITHM,
    )


def decode_password_reset_token(token: str) -> tuple[str, str] | None:
    """(user_id, empreinte) si le lien est valide."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
    except JWTError:
        return None
    if payload.get("type") != "password_reset" or not payload.get("uid") or not payload.get("pwf"):
        return None
    return payload["uid"], payload["pwf"]


def password_fingerprint_matches(password_hash: str | None, fingerprint: str) -> bool:
    import hmac
    return hmac.compare_digest(_password_fingerprint(password_hash), fingerprint)

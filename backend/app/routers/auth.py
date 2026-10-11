import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from sqlalchemy import func, select

from app.config import settings
from app.core.deps import DB, CurrentUser
from app.core.security import (create_access_token, create_email_verification_token,
                                create_password_reset_token, create_refresh_token,
                                decode_email_verification_token, decode_password_reset_token,
                                decode_token, hash_password, password_fingerprint_matches,
                                verify_password)
from app.core.security_middleware import InMemoryRateLimiter, validate_password_strength
from app.models.user import User, UserPreferences, UserStats
from app.schemas.auth import (EmailRequest, GoogleAuthRequest, LoginRequest, RefreshRequest,
                               ResetPasswordRequest, SignupPendingResponse, SignupRequest,
                               TokenResponse, UserOut, VerifyEmailRequest)
from app.services import antibot, mailer
from app.services.moderation import blocked_message, lift_if_expired

router = APIRouter(prefix="/auth", tags=["Authentication"])
logger = logging.getLogger("justicia.auth")

# Échecs de mot de passe par compte (en plus de la limite par IP du middleware) :
# freine le « password spraying » réparti sur plusieurs adresses IP.
login_failures = InMemoryRateLimiter(max_requests=8, window_seconds=900)
# Un e-mail de confirmation / de réinitialisation par adresse et par minute au plus
verification_mail_cooldown = InMemoryRateLimiter(max_requests=1, window_seconds=60)
reset_mail_cooldown = InMemoryRateLimiter(max_requests=1, window_seconds=60)

PENDING_MESSAGE = (
    "Compte créé. Un e-mail de confirmation vient d'être envoyé : cliquez sur le lien "
    "qu'il contient pour activer votre compte (pensez à vérifier les courriers indésirables)."
)


def _make_token_response(user: User) -> dict:
    uid = str(user.id)
    return {
        "access_token":  create_access_token(uid),
        "refresh_token": create_refresh_token(uid),
        "token_type":    "bearer",
        "user":          UserOut.model_validate(user),
    }


def _client_ip(request: Request) -> str | None:
    return request.client.host if request.client else None


async def _find_by_email(db, email: str) -> User | None:
    result = await db.execute(select(User).where(func.lower(User.email) == email.strip().lower()))
    return result.scalars().first()


async def _send_verification_email(user_id: str, email: str, name: str) -> None:
    token = create_email_verification_token(user_id, email)
    link = f"{settings.FRONTEND_URL.rstrip('/')}/verify-email?token={token}"
    await mailer.send_email(
        to=email,
        subject="Confirmez votre adresse e-mail — JusticIA",
        title="Confirmez votre adresse e-mail",
        paragraphs=[
            f"Bonjour {name},",
            "Merci de votre inscription sur JusticIA. Pour activer votre compte, confirmez "
            "votre adresse e-mail en cliquant sur le bouton ci-dessous.",
            "Ce lien est valable 48 heures. Si vous n'êtes pas à l'origine de cette inscription, "
            "ignorez simplement ce message : aucun compte ne sera activé.",
        ],
        cta=("Confirmer mon adresse", link),
    )


async def _send_reset_email(user_id: str, email: str, name: str, password_hash: str | None) -> None:
    token = create_password_reset_token(user_id, password_hash)
    link = f"{settings.FRONTEND_URL.rstrip('/')}/reset-password?token={token}"
    await mailer.send_email(
        to=email,
        subject="Réinitialisation de votre mot de passe — JusticIA",
        title="Réinitialiser votre mot de passe",
        paragraphs=[
            f"Bonjour {name},",
            "Vous avez demandé à réinitialiser le mot de passe de votre compte JusticIA. "
            "Cliquez sur le bouton ci-dessous pour en choisir un nouveau.",
            "Ce lien est valable 1 heure et ne peut servir qu'une fois. Si vous n'avez rien demandé, "
            "ignorez ce message : votre mot de passe reste inchangé.",
        ],
        cta=("Choisir un nouveau mot de passe", link),
    )


def _pending(email: str) -> dict:
    return {"verification_required": True, "email": email, "message": PENDING_MESSAGE}


@router.post(
    "/signup",
    response_model=TokenResponse | SignupPendingResponse,
    status_code=status.HTTP_201_CREATED,
)
async def signup(body: SignupRequest, request: Request, background: BackgroundTasks, db: DB):
    email = body.email.strip().lower()
    verify = settings.email_verification_required

    # Robots : on répond comme pour une inscription normale, sans rien créer
    if antibot.looks_automated(body.website, body.elapsed_ms):
        logger.info("signup_bot_blocked ip=%s", _client_ip(request))
        if verify:
            return _pending(email)
        raise HTTPException(status_code=400, detail="Inscription refusée. Veuillez réessayer.")
    if not await antibot.verify_turnstile(body.captcha_token, _client_ip(request)):
        raise HTTPException(status_code=400, detail="Vérification anti-robot échouée. Veuillez réessayer.")

    errors = validate_password_strength(body.password)
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))

    existing = await _find_by_email(db, email)
    if existing:
        if not verify:
            raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")
        # Ne pas révéler qu'un compte existe : même réponse ; on renvoie le lien si
        # le compte n'est pas encore confirmé.
        if (not existing.is_verified and existing.auth_provider == "local"
                and verification_mail_cooldown.is_allowed(email)):
            background.add_task(_send_verification_email, str(existing.id), existing.email, existing.name)
        return _pending(email)

    user = User(
        email=email,
        name=body.name,
        password_hash=hash_password(body.password),
        auth_provider="local",
        is_verified=False,
    )
    db.add(user)
    await db.flush()
    db.add(UserPreferences(user_id=user.id))
    db.add(UserStats(user_id=user.id))
    await db.commit()
    await db.refresh(user)

    if verify:
        verification_mail_cooldown.is_allowed(email)
        background.add_task(_send_verification_email, str(user.id), user.email, user.name)
        return _pending(email)
    return _make_token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DB):
    email = body.email.strip().lower()
    if login_failures.remaining(email) == 0:
        raise HTTPException(
            status_code=429,
            detail="Trop de tentatives sur ce compte. Réessayez dans 15 minutes.",
        )

    user = await _find_by_email(db, email)
    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        login_failures.is_allowed(email)
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    if not user.is_active and not await lift_if_expired(user, db):
        raise HTTPException(status_code=403, detail=blocked_message(user))

    if settings.email_verification_required and not user.is_verified and user.auth_provider == "local":
        raise HTTPException(
            status_code=403,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Confirmez d'abord votre adresse e-mail grâce au lien reçu à l'inscription.",
                "email": user.email,
            },
        )

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    return _make_token_response(user)


@router.post("/verify-email")
async def verify_email(body: VerifyEmailRequest, db: DB):
    decoded = decode_email_verification_token(body.token)
    if not decoded:
        raise HTTPException(
            status_code=400,
            detail="Lien de confirmation invalide ou expiré. Demandez-en un nouveau depuis la page de connexion.",
        )
    user_id, email = decoded
    try:
        user = await db.get(User, uuid.UUID(user_id))
    except ValueError:
        user = None
    # L'adresse doit être celle pour laquelle le lien a été émis
    if not user or user.email.lower() != email:
        raise HTTPException(status_code=400, detail="Lien de confirmation invalide.")
    if not user.is_verified:
        user.is_verified = True
        await db.commit()
    return {"success": True, "email": user.email, "message": "Adresse confirmée. Vous pouvez vous connecter."}


@router.post("/resend-verification")
async def resend_verification(body: EmailRequest, background: BackgroundTasks, db: DB):
    email = body.email.strip().lower()
    generic = {
        "success": True,
        "message": "Si un compte non confirmé existe pour cette adresse, un nouveau lien vient d'être envoyé.",
    }
    if not settings.email_verification_required:
        return generic
    user = await _find_by_email(db, email)
    if (user and not user.is_verified and user.auth_provider == "local"
            and verification_mail_cooldown.is_allowed(email)):
        background.add_task(_send_verification_email, str(user.id), user.email, user.name)
    return generic


@router.post("/forgot-password")
async def forgot_password(body: EmailRequest, background: BackgroundTasks, db: DB):
    """Envoie un lien de réinitialisation (réponse identique que le compte existe ou non)."""
    email = body.email.strip().lower()
    generic = {
        "success": True,
        "message": "Si un compte existe pour cette adresse, un lien de réinitialisation vient d'être envoyé.",
    }
    user = await _find_by_email(db, email)
    if user and user.is_active and reset_mail_cooldown.is_allowed(email):
        background.add_task(_send_reset_email, str(user.id), user.email, user.name, user.password_hash)
    return generic


@router.post("/reset-password")
async def reset_password(body: ResetPasswordRequest, db: DB):
    invalid = HTTPException(
        status_code=400,
        detail="Lien de réinitialisation invalide ou expiré. Demandez-en un nouveau.",
    )
    decoded = decode_password_reset_token(body.token)
    if not decoded:
        raise invalid
    user_id, fingerprint = decoded
    try:
        user = await db.get(User, uuid.UUID(user_id))
    except ValueError:
        user = None
    # Usage unique : le lien ne vaut que pour le mot de passe en place au moment de l'envoi
    if not user or not password_fingerprint_matches(user.password_hash, fingerprint):
        raise invalid
    errors = validate_password_strength(body.password)
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))
    user.password_hash = hash_password(body.password)
    # Recevoir le lien prouve la possession de l'adresse
    user.is_verified = True
    await db.commit()
    login_failures._store.pop(user.email.lower(), None)
    return {"success": True, "email": user.email, "message": "Mot de passe modifié. Vous pouvez vous connecter."}


@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: DB):
    """Authentification Google OAuth — vérifie le token Google et crée/retrouve l'utilisateur."""
    import httpx

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                "https://oauth2.googleapis.com/tokeninfo",
                params={"id_token": body.token},
                timeout=10.0,
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Token Google invalide.")
        info = resp.json()
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Impossible de vérifier le token Google.")

    # Vérifier que le token est bien destiné à notre application
    aud = info.get("aud", "")
    if settings.GOOGLE_CLIENT_ID and aud != settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=401, detail="Token Google invalide (audience incorrecte).")

    # Vérifier que l'email est vérifié par Google
    if info.get("email_verified") not in (True, "true"):
        raise HTTPException(status_code=401, detail="Email Google non vérifié.")

    google_id = info.get("sub")
    email     = (info.get("email") or "").strip().lower()
    name      = info.get("name") or email

    if not email:
        raise HTTPException(status_code=401, detail="Email introuvable dans le token Google.")

    user = await _find_by_email(db, email)

    if not user:
        user = User(
            email=email,
            name=name,
            google_id=google_id,
            auth_provider="google",
            is_verified=True,
        )
        db.add(user)
        await db.flush()
        db.add(UserPreferences(user_id=user.id))
        db.add(UserStats(user_id=user.id))
    elif not user.google_id:
        # Compte local existant → lier le Google ID
        user.google_id = google_id
        user.is_verified = True

    if not user.is_active and not await lift_if_expired(user, db):
        raise HTTPException(status_code=403, detail=blocked_message(user))

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return _make_token_response(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(body: RefreshRequest, db: DB):
    user_id = decode_token(body.refresh_token, expected_type="refresh")
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token invalide ou expiré.")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user   = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=401, detail="Utilisateur introuvable.")
    if not user.is_active and not await lift_if_expired(user, db):
        raise HTTPException(status_code=403, detail=blocked_message(user))

    return _make_token_response(user)


@router.post("/logout")
async def logout(current_user: CurrentUser):
    # Avec JWT stateless, le logout est géré côté client (suppression du token)
    return {"success": True, "message": "Déconnexion réussie."}


@router.get("/me", response_model=UserOut)
async def me(current_user: CurrentUser):
    return UserOut.model_validate(current_user)

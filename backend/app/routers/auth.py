from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.security import (create_access_token, create_refresh_token,
                                decode_token, hash_password, verify_password)
from app.core.security_middleware import validate_password_strength
from app.models.user import User, UserPreferences, UserStats
from app.schemas.auth import (GoogleAuthRequest, LoginRequest, RefreshRequest,
                               SignupRequest, TokenResponse, UserOut)

from app.services.moderation import blocked_message, lift_if_expired

router = APIRouter(prefix="/auth", tags=["Authentication"])




def _make_token_response(user: User) -> dict:
    uid = str(user.id)
    return {
        "access_token":  create_access_token(uid),
        "refresh_token": create_refresh_token(uid),
        "token_type":    "bearer",
        "user":          UserOut.model_validate(user),
    }


@router.post("/signup", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, db: DB):
    # Valider la force du mot de passe
    errors = validate_password_strength(body.password)
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Cet email est déjà utilisé.")

    user = User(
        email=body.email,
        name=body.name,
        password_hash=hash_password(body.password),
        auth_provider="local",
    )
    db.add(user)
    await db.flush()

    db.add(UserPreferences(user_id=user.id))
    db.add(UserStats(user_id=user.id))
    await db.commit()
    await db.refresh(user)
    return _make_token_response(user)


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: DB):
    result = await db.execute(select(User).where(User.email == body.email))
    user   = result.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email ou mot de passe incorrect.")

    if not user.is_active and not await lift_if_expired(user, db):
        raise HTTPException(status_code=403, detail=blocked_message(user))

    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    return _make_token_response(user)


@router.post("/google", response_model=TokenResponse)
async def google_auth(body: GoogleAuthRequest, db: DB):
    """Authentification Google OAuth — vérifie le token Google et crée/retrouve l'utilisateur."""
    import httpx
    from app.config import settings

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
    email     = info.get("email")
    name      = info.get("name") or email

    if not email:
        raise HTTPException(status_code=401, detail="Email introuvable dans le token Google.")

    result = await db.execute(select(User).where(User.email == email))
    user   = result.scalar_one_or_none()

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
    user_id = decode_token(body.refresh_token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token invalide ou expiré.")

    import uuid
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

import json

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.core.features import FEATURE_REGISTRY, get_plan_features
from app.core.security import hash_password, verify_password
from app.core.security_middleware import validate_password_strength
from app.models.content import PricingPlan
from app.models.conversation import Conversation
from app.models.subscription import Subscription
from app.models.user import UserPreferences, UserStats
from app.schemas.user import (ChangePasswordRequest, CompleteProfileRequest,
                               PreferencesOut, StatsOut, UpdatePreferencesRequest,
                               UpdateProfileRequest, UserFeaturesOut, UserProfileOut)

router = APIRouter(prefix="/user", tags=["User"])


@router.get("/profile", response_model=UserProfileOut)
async def get_profile(current_user: CurrentUser, db: DB):
    # Charger préférences et stats si pas encore chargées
    stats_r = await db.execute(select(UserStats).where(UserStats.user_id == current_user.id))
    stats   = stats_r.scalar_one_or_none()

    prefs_r = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    prefs   = prefs_r.scalar_one_or_none()

    profile = UserProfileOut(
        id=str(current_user.id),
        name=current_user.name,
        email=current_user.email,
        phone=current_user.phone,
        birth_date=current_user.birth_date,
        profession=current_user.profession,
        address=current_user.address,
        language=current_user.language,
        role=current_user.role,
        is_verified=current_user.is_verified,
        profile_type=current_user.profile_type,
        profile_completed=current_user.profile_completed,
        bio=current_user.bio,
        organization=current_user.organization,
        bar_number=current_user.bar_number,
        city=current_user.city,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
        stats=StatsOut(
            conversations=stats.conversations_count if stats else 0,
            questions=stats.questions_count if stats else 0,
            agents=stats.agents_used_count if stats else 0,
            documents=stats.documents_count if stats else 0,
        ),
        preferences=PreferencesOut.model_validate(prefs) if prefs else None,
    )
    return profile


@router.put("/profile", response_model=UserProfileOut)
async def update_profile(body: UpdateProfileRequest, current_user: CurrentUser, db: DB):
    if body.name is not None:         current_user.name         = body.name
    if body.phone is not None:        current_user.phone        = body.phone
    if body.birth_date is not None:   current_user.birth_date   = body.birth_date
    if body.profession is not None:   current_user.profession   = body.profession
    if body.address is not None:      current_user.address      = body.address
    if body.language is not None:     current_user.language     = body.language
    if body.bio is not None:          current_user.bio          = body.bio
    if body.organization is not None: current_user.organization = body.organization
    if body.bar_number is not None:   current_user.bar_number   = body.bar_number
    if body.city is not None:         current_user.city         = body.city
    if body.profile_type is not None: current_user.profile_type = body.profile_type

    await db.commit()
    await db.refresh(current_user)
    return await get_profile(current_user, db)


@router.put("/preferences", response_model=PreferencesOut)
async def update_preferences(body: UpdatePreferencesRequest, current_user: CurrentUser, db: DB):
    result = await db.execute(select(UserPreferences).where(UserPreferences.user_id == current_user.id))
    prefs  = result.scalar_one_or_none()

    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)

    for field, value in body.model_dump(exclude_none=True).items():
        setattr(prefs, field, value)

    await db.commit()
    await db.refresh(prefs)
    return PreferencesOut.model_validate(prefs)


@router.post("/change-password")
async def change_password(body: ChangePasswordRequest, current_user: CurrentUser, db: DB):
    if not current_user.password_hash:
        raise HTTPException(status_code=400, detail="Compte OAuth — pas de mot de passe à changer.")

    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Mot de passe actuel incorrect.")

    errors = validate_password_strength(body.new_password)
    if errors:
        raise HTTPException(status_code=400, detail=" ".join(errors))

    current_user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"success": True, "message": "Mot de passe mis à jour."}


@router.delete("/conversations")
async def delete_all_conversations(current_user: CurrentUser, db: DB):
    """Supprime toutes les conversations de l'utilisateur (droit RGPD à l'effacement)."""
    result = await db.execute(
        select(Conversation).where(Conversation.user_id == current_user.id)
    )
    conversations = result.scalars().all()
    count = len(conversations)

    for conv in conversations:
        await db.delete(conv)

    # Réinitialiser les stats
    stats_result = await db.execute(select(UserStats).where(UserStats.user_id == current_user.id))
    stats = stats_result.scalar_one_or_none()
    if stats:
        stats.conversations_count = 0

    await db.commit()
    return {"success": True, "deleted": count, "message": f"{count} conversation(s) supprimée(s)."}


@router.post("/complete-profile", response_model=UserProfileOut)
async def complete_profile(body: CompleteProfileRequest, current_user: CurrentUser, db: DB):
    """
    Finalise le profil après inscription.
    Redirige l'onboarding vers le dashboard une fois terminé.
    """
    if body.profile_type: current_user.profile_type = body.profile_type
    current_user.profile_completed = True
    if body.survey is not None: current_user.onboarding_survey = body.survey
    if body.name:         current_user.name         = body.name.strip()
    if body.phone:        current_user.phone        = body.phone.strip()
    if body.bio:          current_user.bio          = body.bio.strip()
    if body.organization: current_user.organization = body.organization.strip()
    if body.bar_number:   current_user.bar_number   = body.bar_number.strip()
    if body.city:         current_user.city         = body.city.strip()
    if body.profession:   current_user.profession   = body.profession.strip()

    await db.commit()
    await db.refresh(current_user)
    return await get_profile(current_user, db)


@router.get("/features", response_model=UserFeaturesOut)
async def get_user_features(current_user: CurrentUser, db: DB):
    """
    Retourne la liste des fonctionnalités accessibles à l'utilisateur
    en fonction de son abonnement actif.
    Le frontend l'utilise pour afficher/masquer les sections et
    présenter le mur de mise à niveau.
    """
    from datetime import date

    today = date.today()
    # Trouver l'abonnement actif
    sub_result = await db.execute(
        select(Subscription)
        .where(
            Subscription.user_id == current_user.id,
            Subscription.status == "active",
        )
        .order_by(Subscription.created_at.desc())
        .limit(1)
    )
    sub = sub_result.scalar_one_or_none()

    plan_id   = "gratuit"
    plan_name = "Gratuit"
    features  = get_plan_features("gratuit")

    if sub and sub.plan_id:
        # Charger le plan depuis la DB pour avoir les feature_flags à jour
        plan_result = await db.execute(
            select(PricingPlan).where(PricingPlan.plan_id == sub.plan_id)
        )
        plan = plan_result.scalar_one_or_none()
        if plan:
            plan_id   = plan.plan_id
            plan_name = plan.name
            try:
                db_flags = json.loads(plan.feature_flags or "[]")
                features = db_flags if db_flags else get_plan_features(plan_id)
            except Exception:
                features = get_plan_features(plan_id)

    return UserFeaturesOut(
        plan_id=plan_id,
        plan_name=plan_name,
        features=features,
        is_free=(plan_id == "gratuit"),
    )


@router.get("/preferences", response_model=PreferencesOut)
async def get_preferences(current_user: CurrentUser, db: DB):
    """Retourne les préférences de l'utilisateur."""
    result = await db.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
        await db.commit()
        await db.refresh(prefs)
    return PreferencesOut.model_validate(prefs)

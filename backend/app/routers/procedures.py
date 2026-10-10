"""
Routes démarches juridiques — publiques (lecture) + admin (CRUD).
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import DB
from app.models.procedure import Procedure
from app.models.user import User
from app.schemas.procedure import ProcedureCreate, ProcedureOut, ProcedureUpdate

router = APIRouter(prefix="/procedures", tags=["Procédures"])


# ── Dépendance admin (réutilise celle de admin.py) ────────────────────────────
from app.core.deps import CurrentUser


def _require_admin(current_user: CurrentUser) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Accès réservé aux administrateurs.")
    return current_user


AdminDep = Depends(_require_admin)


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES PUBLIQUES
# ══════════════════════════════════════════════════════════════════════════════

@router.get("", response_model=list[ProcedureOut])
async def list_procedures_public(db: DB):
    """Retourne toutes les démarches actives, triées par ordre."""
    result = await db.execute(
        select(Procedure)
        .where(Procedure.actif == True)
        .order_by(Procedure.ordre, Procedure.id)
    )
    return result.scalars().all()


# ══════════════════════════════════════════════════════════════════════════════
# ROUTES ADMIN
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/admin/all", response_model=list[ProcedureOut])
async def admin_list_procedures(db: DB, _: User = AdminDep):
    """Admin : liste toutes les démarches (actives + inactives)."""
    result = await db.execute(
        select(Procedure).order_by(Procedure.ordre, Procedure.id)
    )
    return result.scalars().all()


@router.post("/admin", response_model=ProcedureOut, status_code=201)
async def admin_create_procedure(body: ProcedureCreate, db: DB, _: User = AdminDep):
    # Vérifier unicité du slug
    existing = (await db.execute(select(Procedure).where(Procedure.slug == body.slug))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail=f"Le slug '{body.slug}' est déjà utilisé.")

    proc = Procedure(
        slug=body.slug, titre=body.titre, categorie=body.categorie, icon=body.icon,
        description=body.description, duree_totale=body.duree_totale, cout_estime=body.cout_estime,
        difficulte=body.difficulte, urgence=body.urgence,
        docs_requis=body.docs_requis,
        etapes=[e.model_dump() for e in body.etapes],
        conseil=body.conseil, base_legale=body.base_legale,
        questions_ia=body.questions_ia,
        ordre=body.ordre, actif=body.actif,
    )
    db.add(proc)
    await db.commit()
    await db.refresh(proc)
    return proc


@router.put("/admin/{proc_id}", response_model=ProcedureOut)
async def admin_update_procedure(proc_id: int, body: ProcedureUpdate, db: DB, _: User = AdminDep):
    proc = (await db.execute(select(Procedure).where(Procedure.id == proc_id))).scalar_one_or_none()
    if not proc:
        raise HTTPException(status_code=404, detail="Démarche introuvable.")

    data = body.model_dump(exclude_none=True)
    if "etapes" in data:
        data["etapes"] = [e.model_dump() if hasattr(e, "model_dump") else e for e in body.etapes or []]

    for field, value in data.items():
        setattr(proc, field, value)

    await db.commit()
    await db.refresh(proc)
    return proc


@router.patch("/admin/{proc_id}/toggle", response_model=ProcedureOut)
async def admin_toggle_procedure(proc_id: int, db: DB, _: User = AdminDep):
    proc = (await db.execute(select(Procedure).where(Procedure.id == proc_id))).scalar_one_or_none()
    if not proc:
        raise HTTPException(status_code=404, detail="Démarche introuvable.")
    proc.actif = not proc.actif
    await db.commit()
    await db.refresh(proc)
    return proc


@router.delete("/admin/{proc_id}", status_code=204)
async def admin_delete_procedure(proc_id: int, db: DB, _: User = AdminDep):
    proc = (await db.execute(select(Procedure).where(Procedure.id == proc_id))).scalar_one_or_none()
    if not proc:
        raise HTTPException(status_code=404, detail="Démarche introuvable.")
    await db.delete(proc)
    await db.commit()


@router.patch("/admin/reorder", status_code=200)
async def admin_reorder_procedures(ids: list[int], db: DB, _: User = AdminDep):
    """Réordonne les démarches selon la liste d'IDs fournie."""
    for idx, proc_id in enumerate(ids):
        proc = (await db.execute(select(Procedure).where(Procedure.id == proc_id))).scalar_one_or_none()
        if proc:
            proc.ordre = idx
    await db.commit()
    return {"ok": True}

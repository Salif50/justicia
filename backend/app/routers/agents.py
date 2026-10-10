"""
Routes pour les agents personnalisés JusticIA.
- GET  /agents/templates  → liste des documents juridiques disponibles (metadata.json)
- GET  /agents/builtin    → agents intégrés
- GET  /agents/my         → agents personnalisés de l'utilisateur
- POST /agents            → créer un agent personnalisé
- PUT  /agents/{id}       → mettre à jour un agent
- DELETE /agents/{id}     → supprimer un agent
"""
import json
import uuid
from functools import lru_cache
from pathlib import Path

from fastapi import APIRouter, HTTPException
from sqlalchemy import select

from app.config import settings
from app.core.deps import CurrentUser, DB
from app.models.custom_agent import CustomAgent
from app.schemas.custom_agent import (CustomAgentCreate, CustomAgentOut,
                                       CustomAgentUpdate, DocumentTemplate)
from app.services.rag_service import AGENTS_LIST, AGENT_DEFAULT_PROMPTS

router = APIRouter(prefix="/agents", tags=["Agents"])


# ── Chargement du metadata.json ───────────────────────────────────────────────
@lru_cache(maxsize=1)
def _load_metadata() -> list[dict]:
    """Charge et met en cache les métadonnées du corpus."""
    # Le corpus fait partie du moteur IA : model/corpus/metadata.json
    base = Path(settings.RAG_MODEL_PATH)
    candidates = [
        base / "corpus" / "metadata.json",
        base.parent / "corpus" / "metadata.json",   # ancienne organisation
        base / "00_metadata" / "metadata.json",
    ]
    for path in candidates:
        if path.exists():
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    return []


def _build_doc_index() -> dict[str, dict]:
    """Index doc_id → document pour une résolution rapide."""
    return {doc["doc_id"]: doc for doc in _load_metadata()}


# ── Agents intégrés ──────────────────────────────────────────────────────────
@router.get("/builtin")
async def get_builtin_agents():
    """Retourne la liste des agents intégrés de JusticIA."""
    return AGENTS_LIST


# ── Templates (documents juridiques) ─────────────────────────────────────────
@router.get("/templates", response_model=list[DocumentTemplate])
async def get_templates():
    """Retourne tous les documents juridiques disponibles comme templates d'agents."""
    docs = _load_metadata()
    if not docs:
        raise HTTPException(
            status_code=503,
            detail="Les métadonnées du corpus ne sont pas disponibles.",
        )
    return docs


# ── Agents personnalisés ──────────────────────────────────────────────────────
@router.get("/my", response_model=list[CustomAgentOut])
async def get_my_agents(current_user: CurrentUser, db: DB):
    """Retourne les agents personnalisés créés par l'utilisateur."""
    result = await db.execute(
        select(CustomAgent)
        .where(CustomAgent.user_id == current_user.id)
        .order_by(CustomAgent.created_at.desc())
    )
    agents = result.scalars().all()
    return [CustomAgentOut(
        id=str(a.id),
        name=a.name,
        description=a.description,
        system_prompt=a.system_prompt or "",
        doc_ids=a.doc_ids or [],
        domains=a.domains or [],
        created_at=a.created_at,
    ) for a in agents]


@router.post("/", response_model=CustomAgentOut, status_code=201)
async def create_agent(body: CustomAgentCreate, current_user: CurrentUser, db: DB):
    """Crée un agent personnalisé basé sur des documents sélectionnés."""
    if not body.doc_ids:
        raise HTTPException(status_code=400, detail="Sélectionnez au moins un document.")

    doc_index = _build_doc_index()
    unknown = [d for d in body.doc_ids if d not in doc_index]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Documents inconnus : {unknown}")

    # Déduire les domaines uniques des documents sélectionnés
    domains = list(dict.fromkeys(
        doc_index[d]["domaine"]
        for d in body.doc_ids
        if doc_index[d].get("domaine")
    ))

    # Vérifier la limite (ex: 10 agents max par utilisateur)
    count_result = await db.execute(
        select(CustomAgent).where(CustomAgent.user_id == current_user.id)
    )
    existing = count_result.scalars().all()
    if len(existing) >= 10:
        raise HTTPException(
            status_code=400,
            detail="Limite de 10 agents personnalisés atteinte.",
        )

    agent = CustomAgent(
        user_id=current_user.id,
        name=body.name,
        description=body.description,
        system_prompt=body.system_prompt or "",
        doc_ids=body.doc_ids,
        domains=domains,
    )
    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    return CustomAgentOut(
        id=str(agent.id),
        name=agent.name,
        description=agent.description,
        system_prompt=agent.system_prompt or "",
        doc_ids=agent.doc_ids,
        domains=agent.domains,
        created_at=agent.created_at,
    )


@router.put("/{agent_id}", response_model=CustomAgentOut)
async def update_agent(agent_id: str, body: CustomAgentUpdate, current_user: CurrentUser, db: DB):
    """Met à jour le nom ou la description d'un agent personnalisé."""
    result = await db.execute(
        select(CustomAgent).where(
            CustomAgent.id == uuid.UUID(agent_id),
            CustomAgent.user_id == current_user.id,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent introuvable.")

    if body.name is not None:          agent.name          = body.name
    if body.description is not None:   agent.description   = body.description
    if body.system_prompt is not None: agent.system_prompt = body.system_prompt

    await db.commit()
    await db.refresh(agent)

    return CustomAgentOut(
        id=str(agent.id),
        name=agent.name,
        description=agent.description,
        system_prompt=agent.system_prompt or "",
        doc_ids=agent.doc_ids,
        domains=agent.domains,
        created_at=agent.created_at,
    )


@router.delete("/{agent_id}")
async def delete_agent(agent_id: str, current_user: CurrentUser, db: DB):
    """Supprime un agent personnalisé."""
    result = await db.execute(
        select(CustomAgent).where(
            CustomAgent.id == uuid.UUID(agent_id),
            CustomAgent.user_id == current_user.id,
        )
    )
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent introuvable.")

    await db.delete(agent)
    await db.commit()
    return {"success": True, "message": "Agent supprimé."}


# ── Résolution d'un agent (builtin ou custom) pour le router conversation ─────
async def resolve_agent(agent_id: str, user_id: uuid.UUID, db) -> dict:
    """
    Retourne les informations de domaine pour un agent donné.
    Cherche d'abord dans les agents intégrés, puis dans les agents personnalisés.
    """
    from app.services.rag_service import AGENT_DOMAIN_MAP, AGENT_NAMES

    if agent_id in AGENT_DOMAIN_MAP:
        return {
            "name":    AGENT_NAMES.get(agent_id, "JusticIA"),
            "domains": [AGENT_DOMAIN_MAP[agent_id]] if AGENT_DOMAIN_MAP[agent_id] else [],
            "is_custom": False,
        }

    # Chercher dans les agents personnalisés
    try:
        result = await db.execute(
            select(CustomAgent).where(
                CustomAgent.id == uuid.UUID(agent_id),
                CustomAgent.user_id == user_id,
            )
        )
        custom = result.scalar_one_or_none()
        if custom:
            return {
                "name":    custom.name,
                "domains": custom.domains or [],
                "is_custom": True,
            }
    except (ValueError, Exception):
        pass

    # Fallback sur l'agent généraliste
    return {"name": "JusticIA", "domains": [], "is_custom": False}

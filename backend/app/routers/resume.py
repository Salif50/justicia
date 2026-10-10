"""
Résumé automatique de document PDF.

Endpoints :
  POST /resume/upload           — reçoit un PDF, extrait le texte, retourne le texte extrait
  POST /resume/generate         — génère un résumé structuré via LLM à partir du texte
  POST /resume/archives         — sauvegarde une analyse dans les archives
  GET  /resume/archives         — liste les archives de l'utilisateur
  GET  /resume/archives/{id}    — détail d'une archive
  DELETE /resume/archives/{id}  — supprime une archive
"""
from __future__ import annotations

import asyncio
import io
import json
import uuid as _uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import select

from app.config import settings
from app.core.deps import CurrentUser, DB
from app.models.archive import DocumentArchive
from app.services.llm_service import llm

router = APIRouter(prefix="/resume", tags=["Résumé"])

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="resume_ai")

ALLOWED_MIME  = {"application/pdf", "application/x-pdf"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 Mo

# ── Détection de pertinence juridique ─────────────────────────────────────────
# Un seul de ces mots suffit à valider un document juridique
_STRONG_LEGAL = {
    "tribunal", "cour d'appel", "cour suprême", "juridiction", "juge",
    "magistrat", "jugement", "arrêt", "parquet", "procureur", "instruction",
    "condamnation", "acquittement", "relaxe", "assignation", "citation à comparaître",
    "audience", "délibéré", "verdict", "attendu que", "considérant que", "dispositif",
    "huissier", "notaire", "avocat", "barreau",
    "procès-verbal", "procès verbal",
    "infraction", "crime", "délit", "contravention", "garde à vue", "perquisition",
    "arrestation", "détention provisoire", "mise en examen", "inculpé",
    "plaignant", "défendeur", "demandeur",
    "liquidateur judiciaire", "redressement judiciaire",
}

# 3+ de ces mots généraux → document juridique
_GENERAL_LEGAL = {
    "article", "loi", "code", "décret", "ordonnance", "arrêté", "circulaire",
    "contrat", "convention", "accord", "protocole", "avenant", "résiliation",
    "clause", "stipulation", "disposition", "sanction", "amende", "peine",
    "droit", "obligation", "responsabilité", "préjudice", "dommage", "réparation",
    "partie", "signataire", "mandataire", "représentant légal",
    "propriété", "terrain", "foncier", "bail", "loyer", "hypothèque",
    "succession", "héritage", "testateur", "légataire",
    "employeur", "salarié", "licenciement", "convention collective",
    "société", "statuts", "associé", "gérant", "conseil d'administration",
    "guinée", "guinéen", "conakry", "républicain", "ministre",
}


def _check_relevance(text: str) -> tuple[bool, str]:
    """
    Vérifie si le document est juridiquement pertinent.
    Retourne (is_relevant, reason).
    - is_relevant=True  → document juridique confirmé
    - is_relevant=False → document probablement non juridique
    """
    sample = text[:6000].lower()

    # 1. Fort indicateur → pertinent
    for kw in _STRONG_LEGAL:
        if kw in sample:
            return True, ""

    # 2. Indicateurs généraux → pertinent si ≥3
    matches = [kw for kw in _GENERAL_LEGAL if kw in sample]
    if len(matches) >= 3:
        return True, ""

    # 3. Aucun indicateur → non pertinent
    if not matches:
        return False, (
            "Aucun terme juridique n'a été détecté dans ce document. "
            "JusticIA est conçu pour analyser des documents de nature juridique : "
            "contrats, jugements, lois, procès-verbaux, actes notariés, etc."
        )

    # 4. 1-2 indicateurs → ambigu, on laisse passer avec un avertissement
    return True, ""


# ── Schemas ────────────────────────────────────────────────────────────────────

class UploadResponse(BaseModel):
    extracted_text:    str
    page_count:        int
    word_count:        int
    char_count:        int
    filename:          str
    is_relevant:       bool        = True
    relevance_reason:  str         = ""


class GenerateRequest(BaseModel):
    extracted_text: str
    filename:       str = "document"
    detail_level:   str = "standard"  # brief | standard | detailed


class SummarySection(BaseModel):
    title:   str
    content: str
    icon:    str = ""


class GenerateResponse(BaseModel):
    title:         str
    sections:      list[SummarySection]
    key_facts:     list[str]
    raw_summary:   str


# ── Extraction texte ──────────────────────────────────────────────────────────

def _extract_pdf_sync(file_bytes: bytes) -> tuple[str, int]:
    """Extrait le texte d'un PDF (synchrone, pour le thread pool)."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            try:
                text = page.extract_text() or ""
                pages.append(text.strip())
            except Exception:
                pages.append("")
        full_text = "\n\n".join(p for p in pages if p).strip()
        return full_text, len(reader.pages)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Impossible d'extraire le texte : {e}")


# ── Génération LLM ─────────────────────────────────────────────────────────────

SUMMARY_SYSTEM = """Tu es JusticIA, un assistant juridique expert.
Tu génères des résumés structurés, précis et professionnels de documents juridiques guinéens.
Tu réponds UNIQUEMENT en JSON valide selon le schéma demandé.
Ne génère rien d'autre que le JSON."""


def _build_summary_prompt(text: str, filename: str, detail_level: str) -> str:
    length_guide = {
        "brief":    "Court (max 150 mots par section, 3 points clés)",
        "standard": "Standard (max 300 mots par section, 5 points clés)",
        "detailed": "Détaillé (max 500 mots par section, 8 points clés)",
    }.get(detail_level, "Standard (max 300 mots par section, 5 points clés)")

    return f"""Analyse ce document juridique nommé "{filename}" et génère un résumé structuré.

Niveau de détail : {length_guide}

DOCUMENT À ANALYSER :
{text[:12000]}

Réponds UNIQUEMENT avec ce JSON (sans markdown, sans ```json) :
{{
  "title": "Titre clair et descriptif du document",
  "sections": [
    {{
      "icon": "📋",
      "title": "Nature du document",
      "content": "Type de document, juridiction concernée, date si disponible"
    }},
    {{
      "icon": "👥",
      "title": "Parties impliquées",
      "content": "Demandeur, défendeur, parties tierces — noms et qualités"
    }},
    {{
      "icon": "📝",
      "title": "Objet et faits",
      "content": "Résumé des faits essentiels et de l'objet du litige ou de l'acte"
    }},
    {{
      "icon": "⚖️",
      "title": "Fondements juridiques",
      "content": "Articles de loi, codes, jurisprudences cités ou applicables"
    }},
    {{
      "icon": "🔍",
      "title": "Analyse et enjeux",
      "content": "Points de droit soulevés, questions cruciales, risques identifiés"
    }},
    {{
      "icon": "✅",
      "title": "Conclusion / Dispositif",
      "content": "Décision rendue, mesures ordonnées, ou résultat de l'acte"
    }}
  ],
  "key_facts": [
    "Fait ou point clé n°1",
    "Fait ou point clé n°2",
    "Fait ou point clé n°3"
  ],
  "raw_summary": "Résumé narratif en 2-4 paragraphes couvrant l'essentiel du document"
}}"""


def _generate_summary_sync(text: str, filename: str, detail_level: str) -> dict:
    """Génère un résumé via le service LLM centralisé (synchrone)."""
    import json, re

    prompt = _build_summary_prompt(text, filename, detail_level)
    raw    = llm.call(SUMMARY_SYSTEM, prompt, json_mode=True, max_tokens=4096, temperature=0.2)

    raw = raw.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "title":       filename,
            "sections":    [{"icon": "📝", "title": "Résumé", "content": raw[:2000]}],
            "key_facts":   [],
            "raw_summary": raw[:1000],
        }


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=UploadResponse)
async def upload_and_extract(
    file: UploadFile = File(...),
    current_user: CurrentUser = ...,
):
    """Reçoit un PDF, extrait le texte et retourne les métadonnées d'extraction."""
    # Vérification MIME
    if file.content_type not in ALLOWED_MIME and not (file.filename or "").endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    file_bytes = await file.read()

    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Le fichier est vide.")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 25 Mo).")

    # Extraction dans thread pool
    loop  = asyncio.get_event_loop()
    extracted_text, page_count = await loop.run_in_executor(
        _executor, _extract_pdf_sync, file_bytes
    )

    word_count = len(extracted_text.split())
    char_count = len(extracted_text)

    is_relevant, relevance_reason = _check_relevance(extracted_text)

    return UploadResponse(
        extracted_text=extracted_text,
        page_count=page_count,
        word_count=word_count,
        char_count=char_count,
        filename=file.filename or "document.pdf",
        is_relevant=is_relevant,
        relevance_reason=relevance_reason,
    )


@router.post("/generate", response_model=GenerateResponse)
async def generate_summary(
    body: GenerateRequest,
    current_user: CurrentUser = ...,
):
    """Génère un résumé structuré via LLM à partir du texte extrait."""
    if not body.extracted_text or len(body.extracted_text.strip()) < 50:
        raise HTTPException(
            status_code=400,
            detail="Le texte extrait est trop court pour générer un résumé.",
        )

    loop   = asyncio.get_event_loop()
    result = await loop.run_in_executor(
        _executor,
        _generate_summary_sync,
        body.extracted_text,
        body.filename,
        body.detail_level,
    )

    sections = [
        SummarySection(
            icon=s.get("icon", "📌"),
            title=s.get("title", ""),
            content=s.get("content", ""),
        )
        for s in result.get("sections", [])
    ]

    return GenerateResponse(
        title=result.get("title", body.filename),
        sections=sections,
        key_facts=result.get("key_facts", []),
        raw_summary=result.get("raw_summary", ""),
    )


# ── Schemas Archives ──────────────────────────────────────────────────────────

class ArchiveSaveRequest(BaseModel):
    filename:       str
    page_count:     int = 0
    word_count:     int = 0
    detail_level:   str = "standard"
    extracted_text: str = ""
    summary:        dict  # GenerateResponse sérialisé


class ArchiveOut(BaseModel):
    id:            str
    filename:      str
    page_count:    int
    word_count:    int
    detail_level:  str
    summary_title: str
    created_at:    str

    model_config = {"from_attributes": True}


class ArchiveDetailOut(ArchiveOut):
    extracted_text: str
    summary:        dict


def _arch_out(a: DocumentArchive) -> ArchiveOut:
    return ArchiveOut(
        id=str(a.id),
        filename=a.filename,
        page_count=a.page_count,
        word_count=a.word_count,
        detail_level=a.detail_level,
        summary_title=a.summary_title,
        created_at=a.created_at.isoformat(),
    )


def _arch_detail_out(a: DocumentArchive) -> ArchiveDetailOut:
    try:
        summary_data = json.loads(a.summary_json)
    except Exception:
        summary_data = {}
    return ArchiveDetailOut(
        id=str(a.id),
        filename=a.filename,
        page_count=a.page_count,
        word_count=a.word_count,
        detail_level=a.detail_level,
        summary_title=a.summary_title,
        created_at=a.created_at.isoformat(),
        extracted_text=a.extracted_text,
        summary=summary_data,
    )


# ── Endpoints Archives ─────────────────────────────────────────────────────────

@router.post("/archives", response_model=ArchiveOut, status_code=201)
async def save_archive(
    body: ArchiveSaveRequest,
    current_user: CurrentUser,
    db: DB,
):
    """Sauvegarde une analyse (texte + résumé) dans les archives de l'utilisateur."""
    archive = DocumentArchive(
        user_id=current_user.id,
        filename=body.filename,
        page_count=body.page_count,
        word_count=body.word_count,
        detail_level=body.detail_level,
        extracted_text=body.extracted_text,
        summary_json=json.dumps(body.summary, ensure_ascii=False),
        summary_title=body.summary.get("title", body.filename),
    )
    db.add(archive)
    await db.commit()
    await db.refresh(archive)
    return _arch_out(archive)


@router.get("/archives", response_model=list[ArchiveOut])
async def list_archives(
    current_user: CurrentUser,
    db: DB,
    limit: int = 50,
):
    """Liste toutes les archives de l'utilisateur, du plus récent au plus ancien."""
    result = await db.execute(
        select(DocumentArchive)
        .where(DocumentArchive.user_id == current_user.id)
        .order_by(DocumentArchive.created_at.desc())
        .limit(limit)
    )
    return [_arch_out(a) for a in result.scalars()]


@router.get("/archives/{archive_id}", response_model=ArchiveDetailOut)
async def get_archive(
    archive_id: str,
    current_user: CurrentUser,
    db: DB,
):
    """Retourne le détail complet d'une archive (texte extrait + résumé complet)."""
    try:
        aid = _uuid.UUID(archive_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalide")

    result = await db.execute(
        select(DocumentArchive).where(
            DocumentArchive.id == aid,
            DocumentArchive.user_id == current_user.id,
        )
    )
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="Archive introuvable")

    return _arch_detail_out(archive)


@router.delete("/archives/{archive_id}", status_code=204)
async def delete_archive(
    archive_id: str,
    current_user: CurrentUser,
    db: DB,
):
    """Supprime une archive."""
    try:
        aid = _uuid.UUID(archive_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalide")

    result = await db.execute(
        select(DocumentArchive).where(
            DocumentArchive.id == aid,
            DocumentArchive.user_id == current_user.id,
        )
    )
    archive = result.scalar_one_or_none()
    if not archive:
        raise HTTPException(status_code=404, detail="Archive introuvable")

    await db.delete(archive)
    await db.commit()

"""
Comparaison de textes juridiques — JusticIA
============================================
POST /comparison/compare  — compare deux textes (texte collé ou PDF)
POST /comparison/legal    — compare un texte contre le corpus légal guinéen (RAG)
"""
from __future__ import annotations

import asyncio
import io
import json
import re
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.deps import CurrentUser
from app.schemas.comparison import (
    ArticleCheck,
    CompareTextsResponse,
    DiffItem,
    LegalCompareResponse,
)
from app.services.llm_service import llm
from app.services.rag_service import ask_rag

router = APIRouter(prefix="/comparison", tags=["comparison"])

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="comparison")

MAX_TEXT_CHARS = 15_000
MAX_FILE_SIZE  = 25 * 1024 * 1024  # 25 Mo
ALLOWED_MIME   = {"application/pdf"}

# ── Prompts système ──────────────────────────────────────────────────────────

COMPARE_SYSTEM = """Tu es JusticIA, expert en analyse comparative de textes juridiques guinéens.
Tu compares deux textes juridiques et fournis un rapport d'analyse structuré et objectif.
Tu réponds UNIQUEMENT en JSON valide sans markdown ni ```. Sois précis et professionnel."""

LEGAL_SYSTEM = """Tu es JusticIA, expert en conformité juridique guinéenne.
Tu compares un texte contre les articles de loi guinéens applicables et identifies les écarts.
Tu réponds UNIQUEMENT en JSON valide sans markdown ni ```. Sois exhaustif et précis."""

DOMAINS = {
    "general":    "jurisprudence",
    "travail":    "travail",
    "commercial": "commercial",
    "civil":      "civil",
    "immobilier": "immobilier",
    "penal":      "pénal",
    "famille":    "famille",
}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _extract_pdf_sync(file_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages  = []
        for page in reader.pages:
            try:
                text = page.extract_text() or ""
                pages.append(text.strip())
            except Exception:
                pages.append("")
        result = "\n\n".join(p for p in pages if p).strip()
        if not result or len(result) < 30:
            raise HTTPException(status_code=422, detail="Impossible d'extraire du texte de ce PDF.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Erreur lecture PDF : {e}")


def _parse_llm_json(raw: str) -> dict:
    raw = raw.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        start = raw.find("{")
        end   = raw.rfind("}") + 1
        if start != -1 and end > start:
            try:
                return json.loads(raw[start:end])
            except Exception:
                pass
        raise HTTPException(status_code=502, detail="Réponse LLM invalide (JSON malformé). Réessayez.")


def _build_compare_prompt(
    text_a: str,
    text_b: str,
    label_a: str,
    label_b: str,
    articles_text: str,
) -> str:
    law_section = f"""
═══════════════════════════════════════
ARTICLES DE LOI GUINÉENS APPLICABLES
═══════════════════════════════════════
{articles_text}
""" if articles_text else ""

    return f"""Compare ces deux textes juridiques et génère un rapport d'analyse structuré.

═══════════════════════════════════════
TEXTE A — {label_a}
═══════════════════════════════════════
{text_a[:MAX_TEXT_CHARS]}

═══════════════════════════════════════
TEXTE B — {label_b}
═══════════════════════════════════════
{text_b[:MAX_TEXT_CHARS]}
{law_section}
═══════════════════════════════════════
FORMAT JSON OBLIGATOIRE
═══════════════════════════════════════
Réponds UNIQUEMENT avec ce JSON :
{{
  "summary": "Résumé global de la comparaison en 2-3 phrases précises",
  "similarity_score": 65,
  "key_differences": [
    {{
      "theme": "Durée du contrat",
      "text_a_extract": "Extrait exact de A ou vide si absent dans A",
      "text_b_extract": "Extrait exact de B ou vide si absent dans B",
      "impact": "Impact juridique concret de cette différence",
      "severity": "majeur",
      "favors": "A"
    }}
  ],
  "text_a_strengths": ["Point fort juridique de A", "..."],
  "text_b_strengths": ["Point fort juridique de B", "..."],
  "text_a_weaknesses": ["Point faible juridique de A", "..."],
  "text_b_weaknesses": ["Point faible juridique de B", "..."],
  "recommendation": "Recommandation finale claire et actionnable",
  "risk_a": 30,
  "risk_b": 45
}}

RÈGLES :
- similarity_score : 0 (complètement différents) à 100 (identiques)
- severity : "critique" | "majeur" | "mineur"
- favors : "A" | "B" | "neutre" (quel texte est plus avantageux sur ce point)
- risk_a / risk_b : risque juridique de 0 (sans risque) à 100 (très risqué)
- Identifie entre 3 et 8 différences clés pertinentes
- Si les textes ne sont pas des documents juridiques, analyse-les quand même objectivement
- Contexte : droit guinéen (OHADA inclus)"""


def _build_legal_prompt(text: str, label: str, articles_text: str) -> str:
    return f"""Compare ce texte juridique contre les articles de loi guinéens applicables.

═══════════════════════════════════════
TEXTE À ANALYSER — {label}
═══════════════════════════════════════
{text[:MAX_TEXT_CHARS]}

═══════════════════════════════════════
ARTICLES DE LOI GUINÉENS APPLICABLES
═══════════════════════════════════════
{articles_text or "Aucun article RAG disponible — analyser selon les principes généraux du droit guinéen."}

═══════════════════════════════════════
FORMAT JSON OBLIGATOIRE
═══════════════════════════════════════
Réponds UNIQUEMENT avec ce JSON :
{{
  "domain": "Domaine juridique identifié (ex: Droit du travail)",
  "summary": "Résumé de la conformité en 2-3 phrases",
  "conformity_score": 72,
  "articles_compared": [
    {{
      "article": "Art. 12 — Code du Travail guinéen",
      "requirement": "Exigence précise de cet article",
      "text_extract": "Extrait du texte analysé correspondant (ou vide si absent)",
      "status": "conforme",
      "note": "Explication courte (1 phrase)"
    }}
  ],
  "missing_clauses": ["Clause obligatoire absente 1", "..."],
  "violations": ["Violation de loi identifiée 1", "..."],
  "recommendation": "Actions concrètes pour mettre le texte en conformité"
}}

RÈGLES :
- conformity_score : 0 (non conforme) à 100 (parfaitement conforme)
- status : "conforme" | "partiel" | "manquant" | "violation"
  • conforme  = exigence de l'article respectée dans le texte
  • partiel   = partiellement respectée
  • manquant  = exigence absente du texte
  • violation = clause contraire à l'article
- Analyse CHAQUE article fourni
- missing_clauses : clauses légalement obligatoires mais absentes du texte
- violations : clauses présentes mais contraires à la loi guinéenne"""


def _compare_sync(
    text_a: str,
    text_b: str,
    label_a: str,
    label_b: str,
    articles_text: str,
) -> dict:
    prompt = _build_compare_prompt(text_a, text_b, label_a, label_b, articles_text)
    raw = llm.call(COMPARE_SYSTEM, prompt, json_mode=True, max_tokens=4000, temperature=0.1)
    return _parse_llm_json(raw)


def _legal_sync(text: str, label: str, articles_text: str) -> dict:
    prompt = _build_legal_prompt(text, label, articles_text)
    raw = llm.call(LEGAL_SYSTEM, prompt, json_mode=True, max_tokens=4000, temperature=0.1)
    return _parse_llm_json(raw)


async def _resolve_text(text: str | None, file: UploadFile | None, loop) -> str:
    """Retourne le texte depuis le champ texte ou depuis l'extraction PDF."""
    if file and file.filename:
        file_bytes = await file.read()
        if len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="Le fichier uploadé est vide.")
        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 25 Mo).")
        return await loop.run_in_executor(_executor, _extract_pdf_sync, file_bytes)
    if text and text.strip():
        return text.strip()
    return ""


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/compare", response_model=CompareTextsResponse)
async def compare_texts(
    current_user: CurrentUser,
    text_a:  str        = Form(""),
    text_b:  str        = Form(""),
    label_a: str        = Form("Texte A"),
    label_b: str        = Form("Texte B"),
    file_a:  UploadFile | None = File(None),
    file_b:  UploadFile | None = File(None),
):
    """Compare deux textes juridiques (texte collé ou PDF uploadé)."""
    loop = asyncio.get_event_loop()

    resolved_a, resolved_b = await asyncio.gather(
        _resolve_text(text_a, file_a, loop),
        _resolve_text(text_b, file_b, loop),
    )

    if not resolved_a:
        raise HTTPException(status_code=400, detail="Le Texte A est requis (texte ou PDF).")
    if not resolved_b:
        raise HTTPException(status_code=400, detail="Le Texte B est requis (texte ou PDF).")
    if len(resolved_a) < 20:
        raise HTTPException(status_code=400, detail="Le Texte A est trop court pour être analysé.")
    if len(resolved_b) < 20:
        raise HTTPException(status_code=400, detail="Le Texte B est trop court pour être analysé.")

    # RAG sur les deux textes combinés pour obtenir des articles de référence
    rag_query = f"Comparaison de contrats juridiques guinéens : {resolved_a[:300]} | {resolved_b[:300]}"
    try:
        _, rag_articles = await ask_rag(rag_query, agent_id="jurisprudence", top_k=10)
    except Exception:
        rag_articles = []

    articles_text = "\n".join(
        f"- Art. {a.get('numero', '?')} ({a.get('nom_doc', '')}) : {a.get('texte', '')[:300]}"
        for a in rag_articles[:10]
    )

    data = await loop.run_in_executor(
        _executor,
        _compare_sync,
        resolved_a,
        resolved_b,
        label_a or "Texte A",
        label_b or "Texte B",
        articles_text,
    )

    def _to_diff(d: dict) -> DiffItem:
        return DiffItem(
            theme=d.get("theme", ""),
            text_a_extract=d.get("text_a_extract", ""),
            text_b_extract=d.get("text_b_extract", ""),
            impact=d.get("impact", ""),
            severity=d.get("severity", "mineur"),
            favors=d.get("favors", "neutre"),
        )

    return CompareTextsResponse(
        summary=data.get("summary", ""),
        similarity_score=max(0, min(100, int(data.get("similarity_score", 50)))),
        key_differences=[_to_diff(d) for d in data.get("key_differences", []) if isinstance(d, dict)],
        text_a_strengths=data.get("text_a_strengths", []),
        text_b_strengths=data.get("text_b_strengths", []),
        text_a_weaknesses=data.get("text_a_weaknesses", []),
        text_b_weaknesses=data.get("text_b_weaknesses", []),
        recommendation=data.get("recommendation", ""),
        risk_a=max(0, min(100, int(data.get("risk_a", 50)))),
        risk_b=max(0, min(100, int(data.get("risk_b", 50)))),
    )


@router.post("/legal", response_model=LegalCompareResponse)
async def compare_legal(
    current_user: CurrentUser,
    text:   str        = Form(""),
    domain: str        = Form("general"),
    label:  str        = Form("Contrat"),
    file:   UploadFile | None = File(None),
):
    """Compare un texte contre le corpus légal guinéen via RAG."""
    loop = asyncio.get_event_loop()

    resolved = await _resolve_text(text, file, loop)
    if not resolved:
        raise HTTPException(status_code=400, detail="Un texte ou un PDF est requis.")
    if len(resolved) < 20:
        raise HTTPException(status_code=400, detail="Le texte est trop court pour être analysé.")

    agent_id = DOMAINS.get(domain, "jurisprudence")
    rag_query = f"Conformité légale d'un contrat en droit guinéen — domaine {domain} : {resolved[:400]}"

    try:
        _, rag_articles = await ask_rag(
            rag_query,
            agent_id=agent_id,
            top_k=15,
            custom_domains=[agent_id] if agent_id != "jurisprudence" else None,
        )
    except Exception:
        rag_articles = []

    articles_text = "\n".join(
        f"- Art. {a.get('numero', '?')} ({a.get('nom_doc', '')}) : {a.get('texte', '')[:350]}"
        for a in rag_articles[:15]
    )

    data = await loop.run_in_executor(
        _executor,
        _legal_sync,
        resolved,
        label or "Contrat",
        articles_text,
    )

    def _to_article(a: dict) -> ArticleCheck:
        return ArticleCheck(
            article=a.get("article", ""),
            requirement=a.get("requirement", ""),
            text_extract=a.get("text_extract", ""),
            status=a.get("status", "partiel"),
            note=a.get("note", ""),
        )

    return LegalCompareResponse(
        domain=data.get("domain", domain),
        summary=data.get("summary", ""),
        conformity_score=max(0, min(100, int(data.get("conformity_score", 50)))),
        articles_compared=[_to_article(a) for a in data.get("articles_compared", []) if isinstance(a, dict)],
        missing_clauses=data.get("missing_clauses", []),
        violations=data.get("violations", []),
        recommendation=data.get("recommendation", ""),
    )

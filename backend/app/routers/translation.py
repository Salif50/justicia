"""
Traduction juridique & Vulgarisation — JusticIA
================================================
POST /translation/translate  — traduit un texte juridique (texte ou PDF)
POST /translation/simplify   — vulgarise un texte juridique en langage accessible
"""
from __future__ import annotations

import asyncio
import io
import json
import re
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from app.core.deps import CurrentUser
from app.schemas.translation import (
    GlossaryEntry,
    KeyTerm,
    SimplifyResponse,
    TranslateResponse,
)
from app.services.llm_service import llm

router = APIRouter(prefix="/translation", tags=["translation"])

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="translation")

MAX_TEXT_CHARS = 12_000
MAX_FILE_SIZE  = 25 * 1024 * 1024

SUPPORTED_LANGUAGES = {
    "fr":      "Français",
    "en":      "English",
    "ar":      "العربية (Arabe)",
    "pular":   "Pular (Fulfulde)",
    "malinke": "Malinké (Mandingue)",
    "soussou": "Soussou",
}

SIMPLIFY_LEVELS = {
    "public":      "Grand public",
    "professionnel": "Non-juriste averti",
    "etudiant":    "Étudiant en droit",
}

# ── Prompts ───────────────────────────────────────────────────────────────────

TRANSLATE_SYSTEM = """Tu es JusticIA, expert en traduction juridique multilingue spécialisé en droit guinéen.
Tu traduis des textes juridiques avec rigueur, en préservant la terminologie légale, la structure des articles et la numérotation.
Pour les langues locales guinéennes (Pular, Malinké, Soussou), tu fournis une traduction claire et fidèle au sens juridique.
Tu réponds UNIQUEMENT en JSON valide sans markdown ni ```."""

SIMPLIFY_SYSTEM = """Tu es JusticIA, expert en vulgarisation juridique guinéenne.
Tu transformes des textes juridiques complexes en langage clair et accessible, sans déformer le sens légal.
Tu fournis aussi des explications des termes clés et les points importants à retenir.
Tu réponds UNIQUEMENT en JSON valide sans markdown ni ```."""


def _build_translate_prompt(
    text: str,
    source_lang_code: str,
    target_lang_code: str,
    mode: str,
) -> str:
    source = SUPPORTED_LANGUAGES.get(source_lang_code, source_lang_code)
    target = SUPPORTED_LANGUAGES.get(target_lang_code, target_lang_code)

    mode_instruction = (
        "Traduction professionnelle : préserve le style formel, la terminologie juridique exacte et la structure."
        if mode == "professional"
        else "Traduction littérale : reste le plus proche possible du texte source, mot à mot."
    )

    low_resource_note = ""
    if target_lang_code in ("pular", "malinke", "soussou"):
        low_resource_note = f"""
IMPORTANT : Le {target} est une langue locale guinéenne. Fournis la meilleure traduction possible.
Si un terme juridique n'a pas d'équivalent direct, conserve le terme français entre parenthèses : terme_traduit (terme français).
Utilise le vocabulaire courant de cette langue tel qu'il est parlé en Guinée."""

    return f"""Traduis ce texte juridique du {source} vers le {target}.

Mode : {mode_instruction}
{low_resource_note}

════════════════════════════
TEXTE À TRADUIRE
════════════════════════════
{text[:MAX_TEXT_CHARS]}

════════════════════════════
FORMAT JSON OBLIGATOIRE
════════════════════════════
Réponds UNIQUEMENT avec ce JSON :
{{
  "translated_text": "Traduction complète du texte",
  "source_language": "{source}",
  "target_language": "{target}",
  "glossary": [
    {{
      "original": "terme en {source}",
      "translated": "traduction en {target}",
      "note": "explication courte ou contexte (optionnel)"
    }}
  ],
  "translation_notes": "Notes du traducteur : précisions importantes, ambiguïtés ou choix de traduction",
  "preservation_warnings": [
    "Avertissement si une notion juridique n'a pas d'équivalent direct dans la langue cible"
  ]
}}

RÈGLES :
- Préserve la numérotation des articles (Article 1, Art. 12…)
- Préserve les références légales entre crochets [Réf. Art. X — Loi Y]
- Le glossaire doit contenir les 5 à 15 termes juridiques clés traduits
- preservation_warnings : liste vide [] si aucun avertissement"""


def _build_simplify_prompt(text: str, level: str) -> str:
    level_label = SIMPLIFY_LEVELS.get(level, "Grand public")

    level_instructions = {
        "public": "Utilise un vocabulaire de tous les jours. Évite tout jargon juridique. "
                  "Explique comme si tu parlais à une personne sans aucune formation juridique. "
                  "Utilise des exemples concrets de la vie quotidienne guinéenne.",
        "professionnel": "Utilise un langage professionnel mais accessible. "
                         "Tu peux mentionner les termes juridiques mais explique-les brièvement. "
                         "Adapte pour un chef d'entreprise, un commerçant ou un fonctionnaire sans formation juridique.",
        "etudiant": "Conserve la terminologie juridique correcte mais explique les concepts complexes. "
                    "Fais référence aux articles de loi guinéens pertinents. "
                    "Adapte pour un étudiant en droit première ou deuxième année.",
    }

    instruction = level_instructions.get(level, level_instructions["public"])

    return f"""Vulgarise ce texte juridique pour un public : {level_label}.

{instruction}

════════════════════════════
TEXTE À VULGARISER
════════════════════════════
{text[:MAX_TEXT_CHARS]}

════════════════════════════
FORMAT JSON OBLIGATOIRE
════════════════════════════
Réponds UNIQUEMENT avec ce JSON :
{{
  "simplified_text": "Version vulgarisée complète et fidèle du texte",
  "level": "{level_label}",
  "key_terms": [
    {{
      "term": "Terme juridique original",
      "definition": "Explication claire en français simple",
      "article": "Art. X — Référence légale si applicable (sinon vide)"
    }}
  ],
  "important_points": [
    "Point important à retenir 1",
    "Point important à retenir 2"
  ],
  "summary": "Résumé en 2-3 phrases de ce que dit ce texte et ce que ça implique concrètement"
}}

RÈGLES :
- Le texte vulgarisé doit être COMPLET et fidèle au sens original
- Identifie 5 à 12 termes clés à expliquer
- Les important_points doivent être les éléments les plus importants pour le lecteur cible
- Le résumé doit répondre à "Qu'est-ce que ça veut dire concrètement pour moi ?"
- Contexte : droit guinéen, utilisateurs en Guinée"""


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict:
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
        raise HTTPException(status_code=502, detail="Réponse LLM invalide. Réessayez.")


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


async def _resolve_text(text: str | None, file: UploadFile | None, loop) -> str:
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


def _translate_sync(text: str, source: str, target: str, mode: str) -> dict:
    prompt = _build_translate_prompt(text, source, target, mode)
    raw    = llm.call(TRANSLATE_SYSTEM, prompt, json_mode=True, max_tokens=6000, temperature=0.1)
    return _parse_json(raw)


def _simplify_sync(text: str, level: str) -> dict:
    prompt = _build_simplify_prompt(text, level)
    raw    = llm.call(SIMPLIFY_SYSTEM, prompt, json_mode=True, max_tokens=5000, temperature=0.15)
    return _parse_json(raw)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/translate", response_model=TranslateResponse)
async def translate_text(
    current_user:  CurrentUser,
    text:          str        = Form(""),
    source_lang:   str        = Form("fr"),
    target_lang:   str        = Form("en"),
    mode:          str        = Form("professional"),
    file:          UploadFile | None = File(None),
):
    """Traduit un texte juridique (texte collé ou PDF) vers une autre langue."""
    if source_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Langue source non supportée : {source_lang}")
    if target_lang not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"Langue cible non supportée : {target_lang}")
    if source_lang == target_lang:
        raise HTTPException(status_code=400, detail="La langue source et la langue cible doivent être différentes.")

    loop     = asyncio.get_event_loop()
    resolved = await _resolve_text(text, file, loop)

    if not resolved:
        raise HTTPException(status_code=400, detail="Un texte ou un PDF est requis.")
    if len(resolved) < 10:
        raise HTTPException(status_code=400, detail="Le texte est trop court pour être traduit.")

    data = await loop.run_in_executor(_executor, _translate_sync, resolved, source_lang, target_lang, mode)

    def _to_entry(g: dict) -> GlossaryEntry:
        return GlossaryEntry(
            original=g.get("original", ""),
            translated=g.get("translated", ""),
            note=g.get("note", ""),
        )

    return TranslateResponse(
        translated_text=data.get("translated_text", ""),
        source_language=data.get("source_language", SUPPORTED_LANGUAGES.get(source_lang, source_lang)),
        target_language=data.get("target_language", SUPPORTED_LANGUAGES.get(target_lang, target_lang)),
        glossary=[_to_entry(g) for g in data.get("glossary", []) if isinstance(g, dict)],
        translation_notes=data.get("translation_notes", ""),
        preservation_warnings=data.get("preservation_warnings", []),
    )


@router.post("/simplify", response_model=SimplifyResponse)
async def simplify_text(
    current_user: CurrentUser,
    text:         str        = Form(""),
    level:        str        = Form("public"),
    file:         UploadFile | None = File(None),
):
    """Vulgarise un texte juridique en langage accessible selon le niveau cible."""
    if level not in SIMPLIFY_LEVELS:
        level = "public"

    loop     = asyncio.get_event_loop()
    resolved = await _resolve_text(text, file, loop)

    if not resolved:
        raise HTTPException(status_code=400, detail="Un texte ou un PDF est requis.")
    if len(resolved) < 10:
        raise HTTPException(status_code=400, detail="Le texte est trop court pour être vulgarisé.")

    data = await loop.run_in_executor(_executor, _simplify_sync, resolved, level)

    def _to_term(t: dict) -> KeyTerm:
        return KeyTerm(
            term=t.get("term", ""),
            definition=t.get("definition", ""),
            article=t.get("article", ""),
        )

    return SimplifyResponse(
        simplified_text=data.get("simplified_text", ""),
        level=data.get("level", SIMPLIFY_LEVELS.get(level, level)),
        key_terms=[_to_term(t) for t in data.get("key_terms", []) if isinstance(t, dict)],
        important_points=data.get("important_points", []),
        summary=data.get("summary", ""),
    )

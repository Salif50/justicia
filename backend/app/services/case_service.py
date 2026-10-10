"""
Service pour l'analyse IA des documents d'un procès.
Utilise le LLM directement (pas le pipeline RAG car les documents sont
fournis par l'utilisateur, pas issus du corpus juridique).
"""
import asyncio
import io
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from app.config import settings

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="case_ai")

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads" / "cases"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


# ── Extraction texte PDF ──────────────────────────────────────────────────────

def extract_text_from_pdf(file_bytes: bytes) -> tuple[str, int]:
    """Extrait le texte d'un PDF. Retourne (texte, nb_pages)."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            try:
                text = page.extract_text() or ""
                pages.append(text)
            except Exception:
                pages.append("")
        return "\n\n".join(pages).strip(), len(reader.pages)
    except Exception as e:
        return f"[Extraction impossible : {e}]", 0


# ── Appel LLM direct ─────────────────────────────────────────────────────────

SYSTEM_PROMPT = """Tu es JusticIA, un assistant juridique expert en droit guinéen.
Tu analyses les documents d'un dossier judiciaire fournis par l'utilisateur.
Tes réponses sont précises, structurées et basées UNIQUEMENT sur les documents fournis.
Si l'information n'est pas dans les documents, dis-le clairement.
Réponds toujours en français."""


def _build_context(documents: list[dict], notes: list[dict], max_chars: int = 14000) -> str:
    """Construit le contexte à partir des documents et des notes/déclarations."""
    parts = []
    total = 0

    # Documents PDF
    for doc in documents:
        text = (doc.get("extracted_text") or "").strip()
        if not text:
            continue
        header = (
            f"=== DOCUMENT : {doc['name']} "
            f"(Type: {doc.get('doc_type', 'Autre')}"
            + (f", Auteur: {doc['author']}" if doc.get("author") else "")
            + (f", Date: {doc['doc_date']}" if doc.get("doc_date") else "")
            + ") ==="
        )
        chunk = f"{header}\n{text[:3000]}"
        if total + len(chunk) > max_chars:
            break
        parts.append(chunk)
        total += len(chunk)

    # Notes / Déclarations
    if notes:
        notes_header = "=== NOTES ET DÉCLARATIONS D'AUDIENCE ==="
        notes_lines  = []
        for n in notes:
            line = (
                f"[{n['declared_at']}] {n['note_type'].upper()} de {n['author']} :\n"
                f"{n['content']}"
            )
            notes_lines.append(line)
        notes_block = notes_header + "\n\n" + "\n\n".join(notes_lines)
        if total + len(notes_block) <= max_chars:
            parts.append(notes_block)

    if not parts:
        return "[Aucun document ni déclaration disponible dans ce dossier]"
    return "\n\n".join(parts)


def _call_llm_sync(
    question: str,
    case_name: str,
    documents: list[dict],
    notes: list[dict],
    history: list[dict],
) -> str:
    """Appel synchrone au LLM (exécuté dans thread pool)."""
    context = _build_context(documents, notes)

    system = (
        SYSTEM_PROMPT
        + f"\n\nDossier judiciaire : «{case_name}»\n\n"
        + "DOCUMENTS DU DOSSIER :\n"
        + context
    )

    messages = [{"role": "system", "content": system}]
    for msg in history[-8:]:  # max 8 messages d'historique
        messages.append({"role": msg["role"], "content": msg["content"]})
    messages.append({"role": "user", "content": question})

    provider = settings.LLM_PROVIDER.lower()

    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        # Anthropic : system séparé
        sys_msg = messages.pop(0)["content"]
        response = client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=2048,
            system=sys_msg,
            messages=messages,
        )
        return response.content[0].text

    else:  # openai par défaut
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=2048,
            temperature=0.3,
        )
        return response.choices[0].message.content or ""


async def analyze_case_documents(
    question: str,
    case_name: str,
    documents: list[dict],
    history: list[dict],
    notes: list[dict] | None = None,
) -> str:
    """Analyse asynchrone des documents et notes du procès via le LLM."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        _executor, _call_llm_sync, question, case_name, documents, notes or [], history
    )

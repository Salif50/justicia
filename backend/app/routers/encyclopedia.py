"""
Encyclopédie juridique — JusticIA
===================================
POST /encyclopedia/search  — recherche sémantique RAG dans tous les textes de loi
POST /encyclopedia/ask     — Q&A inline sur un texte de loi spécifique
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Form, HTTPException

from app.core.deps import CurrentUser
from app.schemas.encyclopedia import ArticleResult, AskCodeResponse, SearchResponse
from app.services.rag_service import ask_rag, format_sources

router = APIRouter(prefix="/encyclopedia", tags=["encyclopedia"])

MAX_QUESTION_LEN = 800
MAX_QUERY_LEN    = 400

_SEARCH_SYSTEM_PROMPT_SUFFIX = """
# Contexte : Recherche encyclopédique
L'utilisateur effectue une recherche dans l'encyclopédie juridique de Guinée.
Donne d'abord un résumé thématique synthétique (3-5 phrases) des articles trouvés.
Ensuite, liste les points clés des textes les plus pertinents.
Reste factuel et précis — ne fais pas de recommandations personnelles.
"""

_ASK_SYSTEM_PROMPT_SUFFIX = """
# Contexte : Consultation encyclopédique en ligne
L'utilisateur consulte l'encyclopédie juridique guinéenne et pose une question directe sur un texte spécifique.
Réponds de manière claire et structurée, en citant les articles pertinents trouvés dans le contexte.
Si l'utilisateur a ciblé un texte précis, centre ta réponse sur ce texte en priorité.
"""


def _to_article_result(art: dict) -> ArticleResult:
    return ArticleResult(
        article_ref=art.get("article_ref", ""),
        nom_doc=    art.get("nom_doc",     ""),
        numero=     art.get("numero",      ""),
        domaine=    art.get("domaine",     ""),
        texte=      art.get("texte",       "")[:500],
        score=      round(float(art.get("score", 0.0)), 3),
    )


@router.post("/search", response_model=SearchResponse)
async def search_texts(
    current_user: CurrentUser,
    query: str = Form(..., max_length=MAX_QUERY_LEN),
    top_k: int = Form(10),
):
    """
    Recherche sémantique dans tout le corpus juridique guinéen via RAG.
    Retourne un résumé IA + les articles de loi les plus pertinents.
    """
    q = query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="La requête ne peut pas être vide.")

    top_k = max(5, min(top_k, 20))

    try:
        loop = asyncio.get_event_loop()
        answer, sources = await ask_rag(
            question=q,
            agent_id="jurisprudence",
            top_k=top_k,
            system_prompt=_SEARCH_SYSTEM_PROMPT_SUFFIX,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur RAG : {e}")

    formatted = format_sources(sources) if sources else []
    results   = [_to_article_result(a) for a in formatted]

    return SearchResponse(
        query=      q,
        ai_summary= answer or "",
        results=    results,
        total=      len(results),
    )


@router.post("/ask", response_model=AskCodeResponse)
async def ask_code(
    current_user: CurrentUser,
    question:    str = Form(..., max_length=MAX_QUESTION_LEN),
    code_titre:  str = Form(""),
    top_k:       int = Form(8),
):
    """
    Pose une question à l'IA sur un texte de loi spécifique (ou en général).
    Utilisé par les cartes inline de l'encyclopédie.
    """
    question = question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="La question ne peut pas être vide.")

    code_titre = code_titre.strip()
    top_k      = max(4, min(top_k, 15))

    # Contextualise la question si un code est ciblé
    if code_titre:
        enriched_question = (
            f"En consultant spécifiquement le texte suivant : « {code_titre} », "
            f"réponds à cette question : {question}"
        )
    else:
        enriched_question = question

    try:
        loop = asyncio.get_event_loop()
        answer, sources = await ask_rag(
            question=enriched_question,
            agent_id="jurisprudence",
            top_k=top_k,
            system_prompt=_ASK_SYSTEM_PROMPT_SUFFIX,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Erreur RAG : {e}")

    formatted = format_sources(sources) if sources else []
    results   = [_to_article_result(a) for a in formatted]

    return AskCodeResponse(
        answer=     answer or "",
        code_titre= code_titre,
        sources=    results,
    )

"""
Bibliothèque juridique et jurisprudence — données réelles du corpus (model/corpus).

GET /library                         catalogue des textes (statut, source, nb d'articles)
GET /library/search?q=               recherche plein texte dans les articles en vigueur
GET /library/{doc_id}                fiche d'un texte + sommaire
GET /library/{doc_id}/articles       articles (pagination, recherche dans le texte)
GET /library/{doc_id}/articles/{n}   un article par son numéro

GET /jurisprudence                   décisions (recherche, filtres, facettes)
GET /jurisprudence/{id}              décision complète (texte intégral, articles cités)

GET /guides/creation-entreprise      guide « Créer une entreprise » (guichet unique APIP/GDB)
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.core.deps import CurrentUser
from app.services import legal_library as lib

router = APIRouter(tags=["Bibliothèque juridique"])


@router.get("/library")
async def library_catalog(current_user: CurrentUser):
    return lib.catalog()


@router.get("/library/search")
async def library_search(
    current_user: CurrentUser,
    q: str = Query(..., min_length=2, max_length=200),
    doc_id: str = Query("", max_length=10),
    limit: int = Query(30, ge=1, le=60),
):
    return lib.search_articles(q, limit=limit, doc_id=doc_id)


@router.get("/library/{doc_id}")
async def library_document(doc_id: str, current_user: CurrentUser):
    doc = lib.document(doc_id)
    if not doc:
        raise HTTPException(404, "Texte introuvable.")
    return doc


@router.get("/library/{doc_id}/articles")
async def library_document_articles(
    doc_id: str,
    current_user: CurrentUser,
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=200),
    q: str = Query("", max_length=200),
):
    if not lib.articles_of(doc_id):
        raise HTTPException(404, "Texte introuvable.")
    return lib.document_articles(doc_id, offset=offset, limit=limit, q=q.strip())


@router.get("/library/{doc_id}/articles/{num}")
async def library_article(doc_id: str, num: str, current_user: CurrentUser):
    art = lib.article_text(doc_id, num)
    if not art:
        raise HTTPException(404, "Article introuvable dans ce texte.")
    return art


@router.get("/jurisprudence")
async def jurisprudence_list(
    current_user: CurrentUser,
    q: str = Query("", max_length=200),
    juridiction: str = Query("", max_length=80),
    matiere: str = Query("", max_length=60),
    annee: Optional[int] = Query(None, ge=1950, le=2100),
    sort: str = Query("recent", pattern="^(recent|ancien|pertinence)$"),
    doc_id: str = Query("", max_length=10),
    article: str = Query("", max_length=20),
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=60),
):
    return lib.search_decisions(q=q.strip(), juridiction=juridiction, matiere=matiere, annee=annee,
                                sort=sort, offset=offset, limit=limit, doc_id=doc_id, article=article)


@router.get("/jurisprudence/{dec_id}")
async def jurisprudence_detail(dec_id: str, current_user: CurrentUser):
    d = lib.decision(dec_id)
    if not d:
        raise HTTPException(404, "Décision introuvable.")
    return d


@router.get("/guides/creation-entreprise")
async def guide_creation_entreprise(current_user: CurrentUser):
    g = lib.company_guide()
    if not g:
        raise HTTPException(404, "Guide indisponible.")
    return g

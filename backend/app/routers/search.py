"""
Recherche globale — cherche dans conversations, procès, documents et notes.
"""
from __future__ import annotations

from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from fastapi import APIRouter, Query

from app.core.deps import DB, CurrentUser
from app.models.case import Case, CaseDocument, CaseNote
from app.models.conversation import Conversation, Message

router = APIRouter(prefix="/search", tags=["Search"])


@router.get("")
async def global_search(
    q: str = Query(..., min_length=1, max_length=200),
    current_user: CurrentUser = ...,
    db: DB = ...,
):
    """Recherche dans conversations, procès, documents et notes de l'utilisateur."""
    term = f"%{q.lower()}%"
    results: dict = {
        "query": q,
        "conversations": [],
        "cases": [],
        "documents": [],
        "notes": [],
    }

    # ── Conversations (titre + contenu du dernier message) ──────────────────────
    conv_q = await db.execute(
        select(Conversation)
        .where(
            Conversation.user_id == current_user.id,
            or_(
                Conversation.title.ilike(term),
            ),
        )
        .order_by(Conversation.updated_at.desc())
        .limit(6)
    )
    for c in conv_q.scalars():
        results["conversations"].append({
            "id":         str(c.id),
            "title":      c.title,
            "agent_id":   c.agent_id,
            "updated_at": c.updated_at.isoformat(),
            "link":       f"/dashboard/conversation/{c.id}",
        })

    # ── Messages contenant le terme ─────────────────────────────────────────────
    msg_q = await db.execute(
        select(Message)
        .join(Conversation, Message.conversation_id == Conversation.id)
        .where(
            Conversation.user_id == current_user.id,
            Message.content.ilike(term),
            Message.sender == "user",
        )
        .order_by(Message.created_at.desc())
        .limit(6)
    )
    seen_conv: set[str] = {c["id"] for c in results["conversations"]}
    for m in msg_q.scalars():
        cid = str(m.conversation_id)
        if cid not in seen_conv:
            seen_conv.add(cid)
            excerpt = m.content[:120] + ("…" if len(m.content) > 120 else "")
            results["conversations"].append({
                "id":       cid,
                "title":    f"Message : {excerpt}",
                "agent_id": "",
                "updated_at": m.created_at.isoformat(),
                "link":     f"/dashboard/conversation/{cid}",
            })

    # ── Procès (nom + description) ──────────────────────────────────────────────
    cases_q = await db.execute(
        select(Case)
        .where(
            Case.user_id == current_user.id,
            or_(
                Case.name.ilike(term),
                Case.description.ilike(term),
            ),
        )
        .order_by(Case.created_at.desc())
        .limit(6)
    )
    for c in cases_q.scalars():
        results["cases"].append({
            "id":          str(c.id),
            "name":        c.name,
            "description": (c.description or "")[:120],
            "status":      c.status,
            "created_at":  c.created_at.isoformat(),
            "link":       f"/dashboard/cases/{c.id}",
        })

    # ── Documents de procès (nom + auteur) ──────────────────────────────────────
    docs_q = await db.execute(
        select(CaseDocument)
        .join(Case, CaseDocument.case_id == Case.id)
        .where(
            Case.user_id == current_user.id,
            or_(
                CaseDocument.name.ilike(term),
                CaseDocument.author.ilike(term),
            ),
        )
        .order_by(CaseDocument.uploaded_at.desc())
        .limit(6)
    )
    for d in docs_q.scalars():
        results["documents"].append({
            "id":          str(d.id),
            "name":        d.name,
            "doc_type":    d.doc_type or "Document",
            "author":      d.author or "",
            "case_id":     str(d.case_id),
            "uploaded_at": d.uploaded_at.isoformat(),
            "link":        f"/dashboard/cases/{d.case_id}",
        })

    # ── Notes / Déclarations (auteur + contenu) ──────────────────────────────────
    notes_q = await db.execute(
        select(CaseNote)
        .join(Case, CaseNote.case_id == Case.id)
        .where(
            Case.user_id == current_user.id,
            or_(
                CaseNote.author.ilike(term),
                CaseNote.content.ilike(term),
            ),
        )
        .order_by(CaseNote.declared_at.desc())
        .limit(6)
    )
    for n in notes_q.scalars():
        excerpt = n.content[:120] + ("…" if len(n.content) > 120 else "")
        results["notes"].append({
            "id":          str(n.id),
            "author":      n.author,
            "note_type":   n.note_type,
            "excerpt":     excerpt,
            "case_id":     str(n.case_id),
            "declared_at": n.declared_at.isoformat(),
            "link":        f"/dashboard/cases/{n.case_id}",
        })

    return results

"""
Router pour la gestion des procès (dossiers judiciaires).

Endpoints :
  POST   /cases/                         créer un procès
  GET    /cases/                         liste des procès de l'utilisateur
  GET    /cases/{case_id}                détail d'un procès
  PUT    /cases/{case_id}                modifier nom / description
  DELETE /cases/{case_id}                supprimer

  POST   /cases/{case_id}/documents      ajouter un document PDF
  DELETE /cases/{case_id}/documents/{doc_id}   supprimer un document

  GET    /cases/{case_id}/messages       historique du chat
  POST   /cases/{case_id}/chat           envoyer un message d'analyse
"""
import uuid as _uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select

from app.core.deps import DB, CurrentUser
from app.models.case import Case, CaseDocument, CaseMessage, CaseNote
from app.schemas.case import (CaseChatRequest, CaseChatResponse,
                               CaseCreate, CaseDocumentOut, CaseMessageOut,
                               CaseNoteCreate, CaseNoteOut, CaseNoteUpdate,
                               CaseOut, CaseOutDetail, CaseUpdate)
from app.services.case_service import UPLOAD_DIR, analyze_case_documents, extract_text_from_pdf

router = APIRouter(prefix="/cases", tags=["Cases"])

ALLOWED_MIME = {"application/pdf", "application/x-pdf"}
MAX_FILE_SIZE = 20 * 1024 * 1024  # 20 Mo


# ── Helpers ───────────────────────────────────────────────────────────────────

async def _get_case_or_404(case_id: str, user_id, db) -> Case:
    try:
        cid = _uuid.UUID(case_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Procès introuvable.")
    result = await db.execute(
        select(Case).where(Case.id == cid, Case.user_id == user_id)
    )
    case = result.scalar_one_or_none()
    if not case:
        raise HTTPException(status_code=404, detail="Procès introuvable.")
    return case


def _case_out(case: Case) -> CaseOut:
    return CaseOut(
        id=str(case.id),
        name=case.name,
        description=case.description,
        document_count=len(case.documents),
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


def _note_out(note: CaseNote) -> CaseNoteOut:
    return CaseNoteOut(
        id=str(note.id),
        author=note.author,
        note_type=note.note_type,
        content=note.content,
        declared_at=note.declared_at,
        created_at=note.created_at,
        updated_at=note.updated_at,
    )


def _doc_out(doc: CaseDocument) -> CaseDocumentOut:
    return CaseDocumentOut(
        id=str(doc.id),
        name=doc.name,
        doc_type=doc.doc_type,
        author=doc.author,
        doc_date=doc.doc_date,
        original_name=doc.original_name,
        file_size=doc.file_size,
        page_count=doc.page_count,
        has_text=bool(doc.extracted_text and doc.extracted_text.strip()),
        created_at=doc.created_at,
    )


# ── CRUD Procès ───────────────────────────────────────────────────────────────

@router.get("/", response_model=list[CaseOut])
async def list_cases(current_user: CurrentUser, db: DB):
    result = await db.execute(
        select(Case)
        .where(Case.user_id == current_user.id)
        .order_by(Case.updated_at.desc())
    )
    cases = result.scalars().all()
    # Charger les documents pour le compte
    for case in cases:
        await db.refresh(case, ["documents"])
    return [_case_out(c) for c in cases]


@router.post("/", response_model=CaseOut, status_code=201)
async def create_case(body: CaseCreate, current_user: CurrentUser, db: DB):
    case = Case(
        user_id=current_user.id,
        name=body.name.strip(),
        description=body.description.strip() if body.description else "",
    )
    db.add(case)
    await db.commit()
    await db.refresh(case, ["documents"])
    return _case_out(case)


@router.get("/{case_id}", response_model=CaseOutDetail)
async def get_case(case_id: str, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    await db.refresh(case, ["documents", "notes"])
    return CaseOutDetail(
        id=str(case.id),
        name=case.name,
        description=case.description,
        document_count=len(case.documents),
        documents=[_doc_out(d) for d in case.documents],
        notes=[_note_out(n) for n in case.notes],
        created_at=case.created_at,
        updated_at=case.updated_at,
    )


@router.put("/{case_id}", response_model=CaseOut)
async def update_case(case_id: str, body: CaseUpdate, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    if body.name is not None:
        case.name = body.name.strip()
    if body.description is not None:
        case.description = body.description.strip()
    await db.commit()
    await db.refresh(case, ["documents"])
    return _case_out(case)


@router.delete("/{case_id}", status_code=204)
async def delete_case(case_id: str, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    # Supprimer les fichiers physiques
    await db.refresh(case, ["documents"])
    for doc in case.documents:
        try:
            Path(doc.file_path).unlink(missing_ok=True)
        except Exception:
            pass
    await db.delete(case)
    await db.commit()


# ── Documents ─────────────────────────────────────────────────────────────────

@router.post("/{case_id}/documents", response_model=CaseDocumentOut, status_code=201)
async def upload_document(
    case_id: str,
    current_user: CurrentUser,
    db: DB,
    file: UploadFile = File(...),
    name: str       = Form(...),
    doc_type: str   = Form("Autre"),
    author: Optional[str]   = Form(None),
    doc_date: Optional[str] = Form(None),
):
    case = await _get_case_or_404(case_id, current_user.id, db)

    # Validation fichier
    if file.content_type not in ALLOWED_MIME and not (file.filename or "").lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    file_bytes = await file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Fichier trop volumineux (max 20 Mo).")

    # Sauvegarde physique
    case_dir = UPLOAD_DIR / case_id
    case_dir.mkdir(parents=True, exist_ok=True)
    doc_id = str(_uuid.uuid4())
    safe_name = f"{doc_id}.pdf"
    file_path = case_dir / safe_name
    file_path.write_bytes(file_bytes)

    # Extraction texte
    extracted_text, page_count = extract_text_from_pdf(file_bytes)

    doc = CaseDocument(
        id=_uuid.UUID(doc_id),
        case_id=case.id,
        name=name.strip(),
        doc_type=doc_type.strip(),
        author=author.strip() if author else None,
        doc_date=doc_date.strip() if doc_date else None,
        file_path=str(file_path),
        original_name=file.filename or safe_name,
        file_size=len(file_bytes),
        extracted_text=extracted_text,
        page_count=page_count,
    )
    db.add(doc)
    await db.commit()
    return _doc_out(doc)


@router.get("/{case_id}/documents/{doc_id}/file")
async def get_document_file(case_id: str, doc_id: str, current_user: CurrentUser, db: DB):
    """Télécharge ou affiche le fichier PDF d'un document."""
    case = await _get_case_or_404(case_id, current_user.id, db)
    try:
        did = _uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document introuvable.")
    result = await db.execute(
        select(CaseDocument).where(CaseDocument.id == did, CaseDocument.case_id == case.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable.")
    file_path = Path(doc.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Fichier introuvable sur le serveur.")
    return FileResponse(
        path=str(file_path),
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{doc.original_name}"'},
    )


@router.delete("/{case_id}/documents/{doc_id}", status_code=204)
async def delete_document(case_id: str, doc_id: str, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    try:
        did = _uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Document introuvable.")
    result = await db.execute(
        select(CaseDocument).where(CaseDocument.id == did, CaseDocument.case_id == case.id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable.")
    try:
        Path(doc.file_path).unlink(missing_ok=True)
    except Exception:
        pass
    await db.delete(doc)
    await db.commit()


# ── Notes / Déclarations ─────────────────────────────────────────────────────

@router.get("/{case_id}/notes", response_model=list[CaseNoteOut])
async def list_notes(case_id: str, current_user: CurrentUser, db: DB):
    """Retourne toutes les notes/déclarations du dossier, ordre chronologique."""
    case = await _get_case_or_404(case_id, current_user.id, db)
    result = await db.execute(
        select(CaseNote)
        .where(CaseNote.case_id == case.id)
        .order_by(CaseNote.declared_at.asc())
    )
    return [_note_out(n) for n in result.scalars().all()]


@router.post("/{case_id}/notes", response_model=CaseNoteOut, status_code=201)
async def add_note(case_id: str, body: CaseNoteCreate, current_user: CurrentUser, db: DB):
    """Enregistre une nouvelle déclaration dans le dossier."""
    from datetime import timezone as _tz
    case = await _get_case_or_404(case_id, current_user.id, db)
    declared_at = body.declared_at or datetime.now(_tz.utc)
    note = CaseNote(
        case_id=case.id,
        author=body.author.strip(),
        note_type=body.note_type.strip() or "Déclaration",
        content=body.content.strip(),
        declared_at=declared_at,
    )
    db.add(note)
    await db.commit()
    return _note_out(note)


@router.put("/{case_id}/notes/{note_id}", response_model=CaseNoteOut)
async def update_note(case_id: str, note_id: str, body: CaseNoteUpdate, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    try:
        nid = _uuid.UUID(note_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Note introuvable.")
    result = await db.execute(
        select(CaseNote).where(CaseNote.id == nid, CaseNote.case_id == case.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note introuvable.")
    if body.author is not None:      note.author      = body.author.strip()
    if body.note_type is not None:   note.note_type   = body.note_type.strip()
    if body.content is not None:     note.content     = body.content.strip()
    if body.declared_at is not None: note.declared_at = body.declared_at
    await db.commit()
    return _note_out(note)


@router.delete("/{case_id}/notes/{note_id}", status_code=204)
async def delete_note(case_id: str, note_id: str, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    try:
        nid = _uuid.UUID(note_id)
    except ValueError:
        raise HTTPException(status_code=404, detail="Note introuvable.")
    result = await db.execute(
        select(CaseNote).where(CaseNote.id == nid, CaseNote.case_id == case.id)
    )
    note = result.scalar_one_or_none()
    if not note:
        raise HTTPException(status_code=404, detail="Note introuvable.")
    await db.delete(note)
    await db.commit()


# ── Chat IA ───────────────────────────────────────────────────────────────────

@router.get("/{case_id}/messages", response_model=list[CaseMessageOut])
async def get_messages(case_id: str, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    result = await db.execute(
        select(CaseMessage)
        .where(CaseMessage.case_id == case.id)
        .order_by(CaseMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [
        CaseMessageOut(id=str(m.id), role=m.role, content=m.content, created_at=m.created_at)
        for m in messages
    ]


@router.post("/{case_id}/chat", response_model=CaseChatResponse)
async def chat(case_id: str, body: CaseChatRequest, current_user: CurrentUser, db: DB):
    case = await _get_case_or_404(case_id, current_user.id, db)
    await db.refresh(case, ["documents"])

    await db.refresh(case, ["notes"])
    source_req = body.source if body.source in ("all", "documents", "notes") else "all"

    has_docs  = len(case.documents) > 0
    has_notes = len(case.notes) > 0

    if source_req == "documents" and not has_docs:
        raise HTTPException(status_code=400, detail="Aucun document disponible dans ce dossier.")
    if source_req == "notes" and not has_notes:
        raise HTTPException(status_code=400, detail="Aucune déclaration disponible dans ce dossier.")
    if source_req == "all" and not has_docs and not has_notes:
        raise HTTPException(
            status_code=400,
            detail="Ajoutez d'abord des documents ou des notes au dossier avant d'analyser.",
        )

    # Historique récent
    hist_result = await db.execute(
        select(CaseMessage)
        .where(CaseMessage.case_id == case.id)
        .order_by(CaseMessage.created_at.desc())
        .limit(16)
    )
    history = [
        {"role": m.role, "content": m.content}
        for m in reversed(hist_result.scalars().all())
    ]

    # Sauvegarder le message utilisateur
    user_msg = CaseMessage(
        case_id=case.id,
        user_id=current_user.id,
        role="user",
        content=body.message,
    )
    db.add(user_msg)
    await db.flush()

    # Appel IA — filtrage par source
    source = body.source if body.source in ("all", "documents", "notes") else "all"

    docs_data = (
        [
            {
                "name":           d.name,
                "doc_type":       d.doc_type,
                "author":         d.author,
                "doc_date":       d.doc_date,
                "extracted_text": d.extracted_text,
            }
            for d in case.documents
        ]
        if source in ("all", "documents")
        else []
    )

    notes_data = (
        [
            {
                "author":      n.author,
                "note_type":   n.note_type,
                "content":     n.content,
                "declared_at": n.declared_at.strftime("%d/%m/%Y %H:%M"),
            }
            for n in case.notes
        ]
        if source in ("all", "notes")
        else []
    )

    try:
        ai_response = await analyze_case_documents(
            question=body.message,
            case_name=case.name,
            documents=docs_data,
            notes=notes_data,
            history=history,
        )
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Erreur IA : {str(e)}")

    # Sauvegarder la réponse IA
    ai_msg = CaseMessage(
        case_id=case.id,
        user_id=current_user.id,
        role="assistant",
        content=ai_response,
    )
    db.add(ai_msg)
    await db.commit()

    return CaseChatResponse(
        id=str(ai_msg.id),
        content=ai_response,
        created_at=ai_msg.created_at,
    )

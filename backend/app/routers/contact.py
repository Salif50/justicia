from fastapi import APIRouter

from app.core.deps import DB
from app.models.subscription import Contact
from app.schemas.contact import AgentOut, ContactRequest
from app.services.rag_service import AGENTS_LIST

router = APIRouter(tags=["Contact & Agents"])


@router.post("/contact/send")
async def send_contact(body: ContactRequest, db: DB):
    contact = Contact(name=body.name, email=body.email, subject=body.subject, message=body.message)
    db.add(contact)
    await db.commit()
    return {"success": True, "message": "Votre message a bien été envoyé. Nous vous répondrons sous 48h."}


@router.get("/agents", response_model=list[AgentOut])
async def list_agents():
    return [AgentOut(**a) for a in AGENTS_LIST]

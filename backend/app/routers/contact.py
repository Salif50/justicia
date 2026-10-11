import logging

from fastapi import APIRouter

from app.core.deps import DB
from app.models.subscription import Contact
from app.schemas.contact import AgentOut, ContactRequest
from app.services import antibot
from app.services.rag_service import AGENTS_LIST

router = APIRouter(tags=["Contact & Agents"])


CONTACT_OK = {"success": True, "message": "Votre message a bien été envoyé. Nous vous répondrons sous 48h."}


# Le site public appelle /contact ; /contact/send est conservé pour compatibilité.
@router.post("/contact")
@router.post("/contact/send")
async def send_contact(body: ContactRequest, db: DB):
    if antibot.looks_automated(body.website, body.elapsed_ms):
        logging.getLogger("justicia.contact").info("contact_bot_blocked")
        return CONTACT_OK  # le robot croit avoir réussi ; rien n'est enregistré
    contact = Contact(name=body.name.strip(), email=body.email, subject=body.subject.strip(), message=body.message.strip())
    db.add(contact)
    await db.commit()
    return CONTACT_OK


@router.get("/agents", response_model=list[AgentOut])
async def list_agents():
    return [AgentOut(**a) for a in AGENTS_LIST]

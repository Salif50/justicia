import uuid
from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from app.core.deps import CurrentUser, DB
from app.models.firm import FirmInvitation, FirmMember
from app.models.user import User
from app.schemas.firm import InvitationCreate, InvitationOut, MemberOut

router = APIRouter(prefix="/firm", tags=["Firm"])

def out(row: FirmInvitation) -> InvitationOut:
    return InvitationOut(id=str(row.id), email=row.email, role=row.role, status=row.status, created_at=row.created_at, token=row.token)

@router.get("/invitations", response_model=list[InvitationOut])
async def list_invitations(current_user: CurrentUser, db: DB):
    rows = (await db.execute(select(FirmInvitation).where(FirmInvitation.owner_id == current_user.id).order_by(FirmInvitation.created_at.desc()))).scalars().all()
    return [out(row) for row in rows]

@router.post("/invitations", response_model=InvitationOut, status_code=201)
async def create_invitation(body: InvitationCreate, current_user: CurrentUser, db: DB):
    email = str(body.email).lower()
    existing = (await db.execute(select(FirmInvitation).where(FirmInvitation.owner_id == current_user.id, FirmInvitation.email == email, FirmInvitation.status == "pending"))).scalar_one_or_none()
    if existing: raise HTTPException(status_code=409, detail="Une invitation est déjà en attente pour cette adresse.")
    row = FirmInvitation(owner_id=current_user.id, email=email, role=body.role)
    db.add(row); await db.commit(); await db.refresh(row)
    return out(row)

@router.delete("/invitations/{invitation_id}", status_code=204)
async def cancel_invitation(invitation_id: str, current_user: CurrentUser, db: DB):
    try: parsed = uuid.UUID(invitation_id)
    except ValueError as exc: raise HTTPException(status_code=404, detail="Invitation introuvable.") from exc
    row = (await db.execute(select(FirmInvitation).where(FirmInvitation.id == parsed, FirmInvitation.owner_id == current_user.id))).scalar_one_or_none()
    if not row: raise HTTPException(status_code=404, detail="Invitation introuvable.")
    await db.delete(row); await db.commit()

@router.post("/invitations/{token}/accept", response_model=MemberOut)
async def accept_invitation(token: str, current_user: CurrentUser, db: DB):
    row = (await db.execute(select(FirmInvitation).where(FirmInvitation.token == token, FirmInvitation.status == "pending"))).scalar_one_or_none()
    if not row: raise HTTPException(status_code=404, detail="Invitation introuvable ou déjà utilisée.")
    if current_user.email.lower() != row.email.lower(): raise HTTPException(status_code=403, detail="Cette invitation est destinée à une autre adresse e-mail.")
    member = (await db.execute(select(FirmMember).where(FirmMember.owner_id == row.owner_id, FirmMember.member_id == current_user.id))).scalar_one_or_none()
    if not member:
        member = FirmMember(owner_id=row.owner_id, member_id=current_user.id, role=row.role); db.add(member)
    row.status = "accepted"; row.accepted_by_id = current_user.id
    await db.commit(); await db.refresh(member)
    return await _member_out(member, db)

async def _member_out(member: FirmMember, db: DB) -> MemberOut:
    user = (await db.execute(select(User).where(User.id == member.member_id))).scalar_one()
    return MemberOut(id=str(member.id), user_id=str(user.id), name=user.name, email=user.email, role=member.role, created_at=member.created_at)

@router.get("/members", response_model=list[MemberOut])
async def list_members(current_user: CurrentUser, db: DB):
    rows = (await db.execute(select(FirmMember).where(FirmMember.owner_id == current_user.id).order_by(FirmMember.created_at))).scalars().all()
    return [await _member_out(row, db) for row in rows]

@router.delete("/members/{member_id}", status_code=204)
async def remove_member(member_id: str, current_user: CurrentUser, db: DB):
    try: parsed = uuid.UUID(member_id)
    except ValueError as exc: raise HTTPException(status_code=404, detail="Membre introuvable.") from exc
    row = (await db.execute(select(FirmMember).where(FirmMember.id == parsed, FirmMember.owner_id == current_user.id))).scalar_one_or_none()
    if not row: raise HTTPException(status_code=404, detail="Membre introuvable.")
    await db.delete(row); await db.commit()

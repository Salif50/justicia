"""Gestion privée des clients d'un cabinet / praticien."""
import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import or_, select

from app.core.deps import CurrentUser, DB
from app.models.client import Client
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate

router = APIRouter(prefix="/clients", tags=["Clients"])


def _out(client: Client) -> ClientOut:
    return ClientOut(id=str(client.id), name=client.name, email=client.email, phone=client.phone,
                     organization=client.organization, status=client.status, notes=client.notes,
                     created_at=client.created_at, updated_at=client.updated_at)


async def _owned(client_id: str, user_id, db: DB) -> Client:
    try:
        parsed = uuid.UUID(client_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail="Client introuvable.") from exc
    client = (await db.execute(select(Client).where(Client.id == parsed, Client.user_id == user_id))).scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client introuvable.")
    return client


@router.get("", response_model=list[ClientOut])
async def list_clients(current_user: CurrentUser, db: DB, q: str | None = Query(default=None, max_length=100), status: str | None = None):
    stmt = select(Client).where(Client.user_id == current_user.id)
    if q and q.strip():
        term = f"%{q.strip()}%"
        stmt = stmt.where(or_(Client.name.ilike(term), Client.email.ilike(term), Client.phone.ilike(term), Client.organization.ilike(term)))
    if status:
        stmt = stmt.where(Client.status == status)
    rows = (await db.execute(stmt.order_by(Client.updated_at.desc()))).scalars().all()
    return [_out(row) for row in rows]


@router.post("", response_model=ClientOut, status_code=201)
async def create_client(body: ClientCreate, current_user: CurrentUser, db: DB):
    client = Client(user_id=current_user.id, name=body.name.strip(), email=body.email, phone=body.phone,
                    organization=body.organization, status=body.status, notes=body.notes)
    db.add(client)
    await db.commit()
    await db.refresh(client)
    return _out(client)


@router.get("/{client_id}", response_model=ClientOut)
async def get_client(client_id: str, current_user: CurrentUser, db: DB):
    return _out(await _owned(client_id, current_user.id, db))


@router.put("/{client_id}", response_model=ClientOut)
async def update_client(client_id: str, body: ClientUpdate, current_user: CurrentUser, db: DB):
    client = await _owned(client_id, current_user.id, db)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(client, key, value.strip() if isinstance(value, str) and key == "name" else value)
    await db.commit()
    await db.refresh(client)
    return _out(client)


@router.delete("/{client_id}", status_code=204)
async def delete_client(client_id: str, current_user: CurrentUser, db: DB):
    client = await _owned(client_id, current_user.id, db)
    await db.delete(client)
    await db.commit()

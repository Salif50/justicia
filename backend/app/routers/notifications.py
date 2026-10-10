"""
Notifications utilisateur.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, update, func

from app.core.deps import DB, CurrentUser
from app.models.notification import Notification

router = APIRouter(prefix="/notifications", tags=["Notifications"])


class NotificationOut(BaseModel):
    id:         str
    type:       str
    title:      str
    message:    str
    link:       str | None
    is_read:    bool
    created_at: str

    model_config = {"from_attributes": True}


class CreateNotificationRequest(BaseModel):
    type:    str = "info"
    title:   str
    message: str
    link:    str | None = None


def _out(n: Notification) -> NotificationOut:
    return NotificationOut(
        id=str(n.id),
        type=n.type,
        title=n.title,
        message=n.message,
        link=n.link,
        is_read=n.is_read,
        created_at=n.created_at.isoformat(),
    )


@router.get("")
async def list_notifications(
    current_user: CurrentUser,
    db: DB,
    limit: int = 20,
    unread_only: bool = False,
):
    """Retourne les dernières notifications de l'utilisateur."""
    q = select(Notification).where(Notification.user_id == current_user.id)
    if unread_only:
        q = q.where(Notification.is_read == False)  # noqa: E712
    q = q.order_by(Notification.created_at.desc()).limit(limit)
    result = await db.execute(q)
    notifications = result.scalars().all()

    # Compter les non lues
    count_q = await db.execute(
        select(func.count()).where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
    )
    unread_count = count_q.scalar() or 0

    return {
        "unread_count": unread_count,
        "notifications": [_out(n) for n in notifications],
    }


@router.put("/{notif_id}/read")
async def mark_read(notif_id: str, current_user: CurrentUser, db: DB):
    """Marque une notification comme lue."""
    try:
        nid = uuid.UUID(notif_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalide")

    result = await db.execute(
        select(Notification).where(
            Notification.id == nid,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")

    notif.is_read = True
    await db.commit()
    return {"ok": True}


@router.put("/read-all")
async def mark_all_read(current_user: CurrentUser, db: DB):
    """Marque toutes les notifications comme lues."""
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read == False,  # noqa: E712
        )
        .values(is_read=True)
    )
    await db.commit()
    return {"ok": True}


@router.delete("/{notif_id}")
async def delete_notification(notif_id: str, current_user: CurrentUser, db: DB):
    """Supprime une notification."""
    try:
        nid = uuid.UUID(notif_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalide")

    result = await db.execute(
        select(Notification).where(
            Notification.id == nid,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if not notif:
        raise HTTPException(status_code=404, detail="Notification introuvable")

    await db.delete(notif)
    await db.commit()
    return {"ok": True}


@router.delete("")
async def clear_all(current_user: CurrentUser, db: DB):
    """Supprime toutes les notifications lues."""
    result = await db.execute(
        select(Notification).where(
            Notification.user_id == current_user.id,
            Notification.is_read == True,  # noqa: E712
        )
    )
    for n in result.scalars():
        await db.delete(n)
    await db.commit()
    return {"ok": True}

"""
Agenda & Échéances.

Endpoints :
  GET    /agenda                     liste des événements de l'utilisateur
  POST   /agenda                     créer un événement
  GET    /agenda/{id}                détail
  PUT    /agenda/{id}                modifier
  DELETE /agenda/{id}                supprimer
  PUT    /agenda/{id}/status         marquer comme fait / annulé
  GET    /agenda/export/ical         exporter tous les événements au format iCal (.ics)
  GET    /agenda/stats               statistiques pour le tableau de bord
"""
from __future__ import annotations

import uuid as _uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.deps import DB, CurrentUser
from app.models.agenda import AgendaEvent
from app.models.case import Case

router = APIRouter(prefix="/agenda", tags=["Agenda"])

# ── Schémas ───────────────────────────────────────────────────────────────────

class EventCreate(BaseModel):
    title:         str
    description:   str = ""
    location:      str | None = None
    event_type:    str = "audience"
    start_at:      datetime
    end_at:        datetime | None = None
    is_all_day:    bool = False
    reminder_days: int  = 1
    color:         str | None = None
    case_id:       str | None = None


class EventUpdate(BaseModel):
    title:         str | None = None
    description:   str | None = None
    location:      str | None = None
    event_type:    str | None = None
    start_at:      datetime | None = None
    end_at:        datetime | None = None
    is_all_day:    bool | None = None
    reminder_days: int | None = None
    color:         str | None = None
    case_id:       str | None = None


class StatusUpdate(BaseModel):
    status: str  # upcoming | done | cancelled


class EventOut(BaseModel):
    id:            str
    title:         str
    description:   str
    location:      str | None
    event_type:    str
    start_at:      str
    end_at:        str | None
    is_all_day:    bool
    reminder_days: int
    color:         str | None
    status:        str
    case_id:       str | None
    case_name:     str | None
    created_at:    str
    updated_at:    str

    model_config = {"from_attributes": True}


def _out(e: AgendaEvent) -> EventOut:
    return EventOut(
        id=str(e.id),
        title=e.title,
        description=e.description or "",
        location=e.location,
        event_type=e.event_type,
        start_at=e.start_at.isoformat(),
        end_at=e.end_at.isoformat() if e.end_at else None,
        is_all_day=e.is_all_day,
        reminder_days=e.reminder_days,
        color=e.color,
        status=e.status,
        case_id=str(e.case_id) if e.case_id else None,
        case_name=e.case.name if e.case else None,
        created_at=e.created_at.isoformat(),
        updated_at=e.updated_at.isoformat(),
    )


async def _get_event_or_404(eid: str, user_id, db) -> AgendaEvent:
    try:
        uid = _uuid.UUID(eid)
    except ValueError:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    result = await db.execute(
        select(AgendaEvent)
        .options(selectinload(AgendaEvent.case))
        .where(AgendaEvent.id == uid, AgendaEvent.user_id == user_id)
    )
    ev = result.scalar_one_or_none()
    if not ev:
        raise HTTPException(status_code=404, detail="Événement introuvable")
    return ev


# ── Liste ─────────────────────────────────────────────────────────────────────

@router.get("", response_model=list[EventOut])
async def list_events(
    current_user: CurrentUser,
    db:           DB,
    month:        int | None = Query(None, ge=1, le=12),
    year:         int | None = Query(None, ge=2000, le=2100),
    case_id:      str | None = None,
    status:       str | None = None,
    upcoming:     bool = False,
):
    q = (
        select(AgendaEvent)
        .options(selectinload(AgendaEvent.case))
        .where(AgendaEvent.user_id == current_user.id)
    )
    if month and year:
        from calendar import monthrange
        _, last_day = monthrange(year, month)
        start = datetime(year, month, 1,  tzinfo=timezone.utc)
        end   = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        q = q.where(AgendaEvent.start_at >= start, AgendaEvent.start_at <= end)
    if case_id:
        try:
            cid = _uuid.UUID(case_id)
            q = q.where(AgendaEvent.case_id == cid)
        except ValueError:
            pass
    if status:
        q = q.where(AgendaEvent.status == status)
    if upcoming:
        now = datetime.now(timezone.utc)
        q = q.where(AgendaEvent.start_at >= now, AgendaEvent.status == "upcoming")
    q = q.order_by(AgendaEvent.start_at)
    result = await db.execute(q)
    return [_out(e) for e in result.scalars()]


# ── Créer ─────────────────────────────────────────────────────────────────────

@router.post("", response_model=EventOut, status_code=201)
async def create_event(
    body:         EventCreate,
    current_user: CurrentUser,
    db:           DB,
):
    case_id = None
    if body.case_id:
        try:
            cid = _uuid.UUID(body.case_id)
            res = await db.execute(
                select(Case).where(Case.id == cid, Case.user_id == current_user.id)
            )
            if res.scalar_one_or_none():
                case_id = cid
        except ValueError:
            pass

    ev = AgendaEvent(
        user_id=current_user.id, case_id=case_id,
        title=body.title, description=body.description,
        location=body.location, event_type=body.event_type,
        start_at=body.start_at, end_at=body.end_at,
        is_all_day=body.is_all_day, reminder_days=body.reminder_days,
        color=body.color,
    )
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    # recharger avec la relation case
    result = await db.execute(
        select(AgendaEvent).options(selectinload(AgendaEvent.case)).where(AgendaEvent.id == ev.id)
    )
    return _out(result.scalar_one())


# ── Détail ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(current_user: CurrentUser, db: DB):
    """Stats pour le dashboard : total, à venir, en retard, aujourd'hui."""
    now   = datetime.now(timezone.utc)
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    tom   = today + timedelta(days=1)

    base = select(func.count()).where(AgendaEvent.user_id == current_user.id)

    total    = (await db.execute(base)).scalar() or 0
    upcoming = (await db.execute(
        base.where(AgendaEvent.start_at >= now, AgendaEvent.status == "upcoming")
    )).scalar() or 0
    overdue  = (await db.execute(
        base.where(AgendaEvent.start_at < now, AgendaEvent.status == "upcoming")
    )).scalar() or 0
    today_c  = (await db.execute(
        base.where(AgendaEvent.start_at >= today, AgendaEvent.start_at < tom)
    )).scalar() or 0

    # 7 prochains événements
    next_q = await db.execute(
        select(AgendaEvent)
        .options(selectinload(AgendaEvent.case))
        .where(AgendaEvent.user_id == current_user.id,
               AgendaEvent.start_at >= now,
               AgendaEvent.status == "upcoming")
        .order_by(AgendaEvent.start_at)
        .limit(7)
    )
    upcoming_list = [_out(e) for e in next_q.scalars()]

    return {
        "total": total, "upcoming": upcoming,
        "overdue": overdue, "today": today_c,
        "next_events": upcoming_list,
    }


@router.get("/{event_id}", response_model=EventOut)
async def get_event(event_id: str, current_user: CurrentUser, db: DB):
    return _out(await _get_event_or_404(event_id, current_user.id, db))


# ── Modifier ──────────────────────────────────────────────────────────────────

@router.put("/{event_id}", response_model=EventOut)
async def update_event(event_id: str, body: EventUpdate, current_user: CurrentUser, db: DB):
    ev = await _get_event_or_404(event_id, current_user.id, db)
    for field, val in body.model_dump(exclude_none=True).items():
        if field == "case_id":
            if val is None:
                ev.case_id = None
            else:
                try:
                    cid = _uuid.UUID(val)
                    res = await db.execute(
                        select(Case).where(Case.id == cid, Case.user_id == current_user.id)
                    )
                    ev.case_id = cid if res.scalar_one_or_none() else ev.case_id
                except ValueError:
                    pass
        else:
            setattr(ev, field, val)
    await db.commit()
    result = await db.execute(
        select(AgendaEvent).options(selectinload(AgendaEvent.case)).where(AgendaEvent.id == ev.id)
    )
    return _out(result.scalar_one())


# ── Statut ────────────────────────────────────────────────────────────────────

@router.put("/{event_id}/status", response_model=EventOut)
async def update_status(event_id: str, body: StatusUpdate, current_user: CurrentUser, db: DB):
    ev = await _get_event_or_404(event_id, current_user.id, db)
    if body.status not in ("upcoming", "done", "cancelled"):
        raise HTTPException(status_code=400, detail="Statut invalide")
    ev.status = body.status
    await db.commit()
    result = await db.execute(
        select(AgendaEvent).options(selectinload(AgendaEvent.case)).where(AgendaEvent.id == ev.id)
    )
    return _out(result.scalar_one())


# ── Supprimer ─────────────────────────────────────────────────────────────────

@router.delete("/{event_id}", status_code=204)
async def delete_event(event_id: str, current_user: CurrentUser, db: DB):
    ev = await _get_event_or_404(event_id, current_user.id, db)
    await db.delete(ev)
    await db.commit()


# ── Export iCal ───────────────────────────────────────────────────────────────

def _escape_ical(s: str) -> str:
    return s.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def _dt_ical(dt: datetime) -> str:
    return dt.strftime("%Y%m%dT%H%M%SZ") if dt.tzinfo else dt.strftime("%Y%m%dT%H%M%S")


@router.get("/export/ical")
async def export_ical(current_user: CurrentUser, db: DB):
    """Exporte tous les événements au format iCalendar (.ics)."""
    result = await db.execute(
        select(AgendaEvent)
        .options(selectinload(AgendaEvent.case))
        .where(AgendaEvent.user_id == current_user.id)
        .order_by(AgendaEvent.start_at)
    )
    events = result.scalars().all()

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//JusticIA//Agenda//FR",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:JusticIA — Agenda",
        "X-WR-TIMEZONE:Africa/Conakry",
    ]

    for e in events:
        uid = f"{e.id}@justicia.gn"
        summary = _escape_ical(e.title)
        desc    = _escape_ical(e.description or "")
        if e.case and e.case.name:
            desc = f"Procès : {_escape_ical(e.case.name)}\\n{desc}".strip("\\n")
        loc = _escape_ical(e.location or "")
        start = _dt_ical(e.start_at)
        end   = _dt_ical(e.end_at or (e.start_at + timedelta(hours=1)))
        stamp = _dt_ical(e.created_at)

        lines += [
            "BEGIN:VEVENT",
            f"UID:{uid}",
            f"DTSTAMP:{stamp}",
            f"DTSTART:{start}",
            f"DTEND:{end}",
            f"SUMMARY:{summary}",
        ]
        if desc:
            lines.append(f"DESCRIPTION:{desc}")
        if loc:
            lines.append(f"LOCATION:{loc}")
        if e.reminder_days > 0:
            lines += [
                "BEGIN:VALARM",
                "ACTION:DISPLAY",
                f"DESCRIPTION:Rappel : {summary}",
                f"TRIGGER:-P{e.reminder_days}D",
                "END:VALARM",
            ]
        lines.append("END:VEVENT")

    lines.append("END:VCALENDAR")

    content = "\r\n".join(lines)
    return Response(
        content=content,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="justicia-agenda.ics"'},
    )

"""
Suivi en direct des étapes de réflexion d'une réponse (« Réflexion… » côté chat).

Le client génère un identifiant de requête, l'envoie avec sa question puis
interroge GET /conversation/progress/{id} pendant le traitement. Les étapes
sont réelles : elles sont émises par le routeur et par le pipeline RAG au
moment où chaque phase commence ou se termine.

Stockage en mémoire (un seul worker uvicorn) ; chaque suivi expire après
quelques minutes. Écritures possibles depuis le thread du pipeline : verrou.
"""

from __future__ import annotations

import re
import threading
import time
from typing import Callable, Optional

_TTL_SECONDS = 300
_MAX_ENTRIES = 2000
_KEY_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")

_lock = threading.Lock()
_store: dict[str, dict] = {}

# Type du rappel transmis au pipeline : emit(step_id, label, status, detail)
Emit = Callable[[str, str, str, Optional[str]], None]


def _purge(now: float) -> None:
    expired = [k for k, v in _store.items() if now - v["updated"] > _TTL_SECONDS]
    for k in expired:
        _store.pop(k, None)
    if len(_store) > _MAX_ENTRIES:
        for k in sorted(_store, key=lambda k: _store[k]["updated"])[: len(_store) - _MAX_ENTRIES]:
            _store.pop(k, None)


def valid_key(key: Optional[str]) -> bool:
    return bool(key) and bool(_KEY_RE.match(key or ""))


def tracker(key: Optional[str], user_id: str) -> "Tracker":
    """Crée le suivi d'une requête (sans effet si le client n'a pas fourni d'identifiant)."""
    t = Tracker(key if valid_key(key) else None, str(user_id))
    if t.key:
        now = time.time()
        with _lock:
            _purge(now)
            _store[t.key] = {"user": t.user_id, "steps": [], "started": now, "updated": now, "done": False}
    return t


def read(key: str, user_id: str) -> Optional[dict]:
    """Étapes visibles par le seul auteur de la requête."""
    with _lock:
        entry = _store.get(key)
        if not entry or entry["user"] != str(user_id):
            return None
        return {
            "steps": [dict(s) for s in entry["steps"]],
            "elapsed_ms": int((time.time() - entry["started"]) * 1000),
            "done": entry["done"],
        }


class Tracker:
    def __init__(self, key: Optional[str], user_id: str):
        self.key = key
        self.user_id = user_id

    def emit(self, step_id: str, label: str, status: str = "active", detail: Optional[str] = None) -> None:
        """Ajoute ou met à jour une étape ; une étape active termine la précédente."""
        if not self.key:
            return
        now = time.time()
        with _lock:
            entry = _store.get(self.key)
            if not entry:
                return
            steps = entry["steps"]
            existing = next((s for s in steps if s["id"] == step_id), None)
            if status == "active":
                for s in steps:
                    if s["status"] == "active" and s["id"] != step_id:
                        s["status"] = "done"
            if existing:
                existing["label"] = label
                existing["status"] = status
                if detail is not None:
                    existing["detail"] = detail[:220]
            else:
                steps.append({"id": step_id, "label": label, "status": status, "detail": (detail or "")[:220]})
            entry["updated"] = now

    def finish(self) -> list[dict]:
        """Clôt toutes les étapes et renvoie la liste finale (jointe à la réponse)."""
        if not self.key:
            return []
        with _lock:
            entry = _store.get(self.key)
            if not entry:
                return []
            for s in entry["steps"]:
                if s["status"] == "active":
                    s["status"] = "done"
            entry["done"] = True
            entry["updated"] = time.time()
            return [dict(s) for s in entry["steps"]]

    @property
    def callback(self) -> Optional[Emit]:
        """Rappel thread-safe transmis au pipeline (None si pas de suivi)."""
        if not self.key:
            return None

        def _cb(step_id: str, label: str, status: str = "active", detail: Optional[str] = None) -> None:
            try:
                self.emit(step_id, label, status, detail)
            except Exception:  # le suivi ne doit jamais casser une réponse
                pass

        return _cb

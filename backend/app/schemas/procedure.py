from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class EtapeSchema(BaseModel):
    num:         int
    titre:       str
    description: str
    duree:       Optional[str] = None
    cout:        Optional[str] = None
    lieu:        Optional[str] = None
    optionnel:   bool = False


class ProcedureBase(BaseModel):
    slug:         str
    titre:        str
    categorie:    str
    icon:         str = "📋"
    description:  str
    duree_totale: str
    cout_estime:  str
    difficulte:   str = "Moyen"
    urgence:      bool = False
    docs_requis:  list[str] = []
    etapes:       list[EtapeSchema] = []
    conseil:      str = ""
    base_legale:  str = ""
    questions_ia: list[str] = []
    ordre:        int = 0
    actif:        bool = True


class ProcedureCreate(ProcedureBase):
    pass


class ProcedureUpdate(BaseModel):
    slug:         Optional[str] = None
    titre:        Optional[str] = None
    categorie:    Optional[str] = None
    icon:         Optional[str] = None
    description:  Optional[str] = None
    duree_totale: Optional[str] = None
    cout_estime:  Optional[str] = None
    difficulte:   Optional[str] = None
    urgence:      Optional[bool] = None
    docs_requis:  Optional[list[str]] = None
    etapes:       Optional[list[EtapeSchema]] = None
    conseil:      Optional[str] = None
    base_legale:  Optional[str] = None
    questions_ia: Optional[list[str]] = None
    ordre:        Optional[int] = None
    actif:        Optional[bool] = None


class ProcedureOut(ProcedureBase):
    id:         int
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

from pydantic import BaseModel


class ArticleResult(BaseModel):
    article_ref: str   = ""
    nom_doc:     str   = ""
    numero:      str   = ""
    domaine:     str   = ""
    texte:       str   = ""
    score:       float = 0.0


class SearchResponse(BaseModel):
    query:      str
    ai_summary: str               = ""
    results:    list[ArticleResult] = []
    total:      int               = 0


class AskCodeResponse(BaseModel):
    answer:     str
    code_titre: str               = ""
    sources:    list[ArticleResult] = []

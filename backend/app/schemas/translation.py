from pydantic import BaseModel


class GlossaryEntry(BaseModel):
    original:   str
    translated: str
    note:       str = ""


class TranslateResponse(BaseModel):
    translated_text:        str
    source_language:        str
    target_language:        str
    glossary:               list[GlossaryEntry] = []
    translation_notes:      str = ""
    preservation_warnings:  list[str] = []


class KeyTerm(BaseModel):
    term:       str
    definition: str
    article:    str = ""


class SimplifyResponse(BaseModel):
    simplified_text:  str
    level:            str
    key_terms:        list[KeyTerm] = []
    important_points: list[str] = []
    summary:          str = ""

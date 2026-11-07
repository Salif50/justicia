"""
Bibliothèque juridique : catalogue des textes, articles et jurisprudence.

Tout est lu dans model/corpus (la même source que le moteur de réponse) :
  - metadata.json            catalogue des textes (statut, source, domaine)
  - articles/doc_XXX.json    articles tels qu'indexés
  - jurisprudence/decisions.json
  - guides/creation_entreprise.json

Aucun texte n'est réécrit ici : on filtre, on pagine, on cherche.
Les fichiers sont rechargés automatiquement s'ils changent (réindexation).
"""

from __future__ import annotations

import json
import re
import threading
import unicodedata
from collections import Counter
from pathlib import Path
from typing import Any, Optional

from app.config import settings

_lock = threading.Lock()
_cache: dict[str, tuple[float, Any]] = {}

CATEGORY_BY_DOMAIN = {
    "Droit constitutionnel": "Constitution et institutions",
    "Droit électoral": "Constitution et institutions",
    "Administration": "Administration et institutions",
    "Justice": "Justice et procédure",
    "Sécurité publique": "Justice et procédure",
    "Défense et sécurité": "Justice et procédure",
    "Droit civil": "Personnes, famille et biens",
    "Droit de la famille": "Personnes, famille et biens",
    "Droit foncier": "Foncier, construction et urbanisme",
    "Droit pénal": "Droit pénal",
    "Droit du travail": "Travail et protection sociale",
    "Sécurité sociale": "Travail et protection sociale",
    "Economie": "Affaires, commerce et OHADA",
    "Commerce et assurances": "Affaires, commerce et OHADA",
    "Transport et commerce": "Transports et mer",
    "Finance": "Finances, banque et fiscalité",
    "Finance publique": "Finances, banque et fiscalité",
    "Fiscalité": "Finances, banque et fiscalité",
    "Marchés publics": "Finances, banque et fiscalité",
    "Mines et ressources naturelles": "Mines, énergie et environnement",
    "Energie": "Mines, énergie et environnement",
    "Environnement": "Mines, énergie et environnement",
    "Numérique": "Numérique et données",
    "Santé publique": "Santé",
}

STATUS_LABELS = {
    "en_vigueur": "En vigueur",
    "abroge": "Abrogé",
    "projet": "Projet (non adopté)",
    "historique": "Version historique",
    "doublon": "Doublon retiré",
}


def _corpus() -> Path:
    return Path(settings.RAG_MODEL_PATH) / "corpus"


def _norm(text: str) -> str:
    text = unicodedata.normalize("NFKD", (text or "").lower())
    text = "".join(c for c in text if not unicodedata.combining(c))
    text = re.sub(r"[’'`´]", " ", text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def _load(path: Path, default: Any) -> Any:
    """Lecture JSON mise en cache, invalidée quand le fichier change."""
    key = str(path)
    try:
        mtime = path.stat().st_mtime
    except FileNotFoundError:
        return default
    with _lock:
        hit = _cache.get(key)
        if hit and hit[0] == mtime:
            return hit[1]
    data = json.loads(path.read_text(encoding="utf-8"))
    with _lock:
        _cache[key] = (mtime, data)
    return data


def _year(meta: dict) -> Optional[int]:
    for field in ("date_promulgation", "date_adoption", "numero", "nom"):
        m = re.search(r"\b(19[5-9]\d|20[0-4]\d)\b", str(meta.get(field) or ""))
        if m:
            return int(m.group(1))
    return None


def _clean_name(name: str) -> str:
    name = re.sub(r"\s+", " ", (name or "").strip())
    if name.isupper():
        name = name.capitalize()
    return name


# ── Catalogue ────────────────────────────────────────────────────────────────

def metadata() -> list[dict]:
    return _load(_corpus() / "metadata.json", [])


def articles_of(doc_id: str) -> list[dict]:
    if not re.fullmatch(r"doc_\d{3,4}", doc_id or ""):
        return []
    return _load(_corpus() / "articles" / f"{doc_id}.json", [])


_norm_cache: dict[str, tuple[int, list[str]]] = {}


def _normed_texts(doc_id: str) -> list[str]:
    """Textes normalisés d'un document (calculés une fois par version du fichier)."""
    arts = articles_of(doc_id)
    hit = _norm_cache.get(doc_id)
    if hit and hit[0] == id(arts):
        return hit[1]
    normed = [_norm(a.get("texte", "")) for a in arts]
    _norm_cache[doc_id] = (id(arts), normed)
    return normed


def decisions() -> list[dict]:
    return _load(_corpus() / "jurisprudence" / "decisions.json", [])


def _citations_index() -> dict[str, Counter]:
    """doc_id → Counter(numéro d'article → nb de décisions qui le citent)."""
    decs = decisions()
    key = ("__citations__", id(decs))
    with _lock:
        hit = _cache.get("__citations__")
        if hit and hit[0] == key:
            return hit[1]
    idx: dict[str, Counter] = {}
    for d in decs:
        seen = set()
        for c in d.get("articles_cites") or []:
            if c.get("doc_id") and (c["doc_id"], c["article"]) not in seen:
                seen.add((c["doc_id"], c["article"]))
                idx.setdefault(c["doc_id"], Counter())[c["article"]] += 1
    with _lock:
        _cache["__citations__"] = (key, idx)
    return idx


FAMILY_LABELS = {
    "code": "Codes et lois",
    "loi": "Lois et ordonnances",
    "constitution": "Constitution",
    "traite": "Traités et règlements",
    "convention": "Conventions internationales",
    "reglementaire": "Décrets et arrêtés réglementaires",
    "organisation": "Organisation de l'administration",
    "ratification": "Ratifications d'accords",
    "promulgation": "Décrets de promulgation",
    "individuel": "Actes individuels",
}
# Familles affichées dans l'onglet principal (le reste : onglet « Décrets et arrêtés »)
MAIN_FAMILIES = {"code", "loi", "constitution", "traite", "convention"}
ACT_FAMILIES = ["reglementaire", "organisation", "individuel", "ratification", "promulgation"]
QUALITY_LABELS = {
    "incoherent": "Le corps du texte ne correspond pas à son titre sur la source",
    "debut_manquant": "Le début du texte manque sur la source",
    "vide": "Texte vide sur la source",
}


def _item(m: dict, by_id: dict, cites: dict, n_articles: int) -> dict:
    statut = m.get("statut", "en_vigueur")
    repl = by_id.get(m.get("remplace_par") or "")
    famille = m.get("famille") or "code"
    typ = (m.get("type") or "")
    if "OHADA" in typ or (famille == "traite" and "OHADA" in (m.get("nom") or "") + (m.get("titre_court") or "")) \
            or "CCJA" in (m.get("nom") or ""):
        categorie = "Droit OHADA"
    elif "GUIDE" in typ:
        categorie = "Guides pratiques"
    elif famille != "code":
        categorie = FAMILY_LABELS.get(famille, "Autres textes")
    else:
        categorie = CATEGORY_BY_DOMAIN.get(m.get("domaine", ""), "Autres textes")
    indexe = m.get("indexe", True) is not False and statut == "en_vigueur"
    return {
        "doc_id": m["doc_id"],
        "nom": _clean_name(m.get("nom", "")),
        "type": (m.get("nature") or typ).replace("DECRETS", "DÉCRET").replace("DECRET", "DÉCRET"),
        "famille": famille,
        "famille_label": FAMILY_LABELS.get(famille, ""),
        "numero": (m.get("numero") or "").strip(),
        "emetteur": m.get("emetteur", ""),
        "annee": _year(m),
        "date": m.get("date_promulgation") or "",
        "domaine": m.get("domaine", ""),
        "categorie": categorie,
        "articles": n_articles,
        "statut": statut,
        "statut_label": STATUS_LABELS.get(statut, statut),
        "statut_source": m.get("statut_source", ""),
        "remplace_par": {"doc_id": repl["doc_id"], "nom": _clean_name(repl.get("nom", ""))} if repl else None,
        "source": m.get("source_officielle", ""),
        "source_url": m.get("url_source") or m.get("url_droitguineen") or "",
        "note": m.get("note", ""),
        "indexe": indexe,
        "qualite": [QUALITY_LABELS.get(q, q) for q in (m.get("qualite") or [])],
        "journal_officiel": m.get("journal_officiel") or [],
        "decisions_citant": sum(cites.get(m["doc_id"], Counter()).values()),
    }


def _items() -> list[dict]:
    """Fiches de tous les textes (calculées une fois par version du catalogue)."""
    metas = metadata()
    hit = _cache.get("__items__")
    if hit and hit[0] == id(metas):
        return hit[1]
    cites = _citations_index()
    by_id = {m["doc_id"]: m for m in metas}
    items = [_item(m, by_id, cites, len(articles_of(m["doc_id"]))) for m in metas]
    with _lock:
        _cache["__items__"] = (id(metas), items)
    return items


def item(doc_id: str) -> Optional[dict]:
    return next((i for i in _items() if i["doc_id"] == doc_id), None)


def catalog() -> dict:
    items = [i for i in _items() if i["famille"] in MAIN_FAMILIES]
    order = {"en_vigueur": 0, "historique": 1, "projet": 2, "abroge": 3, "doublon": 4}
    items.sort(key=lambda x: (order.get(x["statut"], 9), x["categorie"], x["nom"].lower()))
    all_items = _items()
    counts = Counter(i["famille"] for i in all_items)
    return {
        "documents": items,
        "total_articles": sum(i["articles"] for i in all_items if i["indexe"]),
        "total_documents": sum(1 for i in all_items if i["indexe"]),
        "total_textes": len(all_items),
        "total_decisions": len(decisions()),
        "familles": [{"famille": f, "label": FAMILY_LABELS[f], "count": counts.get(f, 0)} for f in ACT_FAMILIES],
        "categories": sorted({i["categorie"] for i in items}),
    }


def acts(q: str = "", famille: str = "", annee: Optional[int] = None, emetteur: str = "",
         sort: str = "recent", offset: int = 0, limit: int = 30) -> dict:
    """Décrets, arrêtés, décisions… : recherche paginée avec filtres."""
    pool = [i for i in _items() if i["famille"] in ACT_FAMILIES]
    facets = {
        "familles": [{"famille": f, "label": FAMILY_LABELS[f], "count": sum(1 for i in pool if i["famille"] == f)}
                     for f in ACT_FAMILIES],
        "annees": sorted({i["annee"] for i in pool if i["annee"]}, reverse=True),
        "emetteurs": Counter(i["emetteur"] for i in pool if i["emetteur"]).most_common(40),
    }
    items = pool
    if famille:
        items = [i for i in items if i["famille"] == famille]
    if annee:
        items = [i for i in items if i["annee"] == annee]
    if emetteur:
        items = [i for i in items if i["emetteur"] == emetteur]
    if q:
        terms = [t for t in _norm(q).split() if len(t) > 1]
        items = [i for i in items if all(t in _norm(f"{i['nom']} {i['numero']} {i['type']}") for t in terms)]
    key = (lambda i: i["date"] or "")
    items = sorted(items, key=key, reverse=(sort != "ancien"))
    return {"total": len(items), "offset": offset, "limit": limit, "items": items[offset: offset + limit],
            "facets": facets}


def relations(doc_id: str) -> dict:
    rel = _load(_corpus() / "relations.json", {}).get(doc_id) or {"cite": [], "cite_par": []}
    names = {i["doc_id"]: i for i in _items()}

    def expand(lst):
        out, seen = [], set()
        for r in lst:
            t = names.get(r["doc_id"])
            if not t or (r["doc_id"], r["type"]) in seen:
                continue
            seen.add((r["doc_id"], r["type"]))
            out.append({"doc_id": r["doc_id"], "type": r["type"], "article": r.get("article", ""),
                        "nom": t["nom"], "nature": t["type"], "date": t["date"], "numero": t["numero"]})
        return out[:40]
    return {"cite": expand(rel.get("cite", [])), "cite_par": expand(rel.get("cite_par", []))}


def _heading(a: dict) -> list[str]:
    return [a[k].strip() for k in ("division", "livre", "partie", "titre", "chapitre", "section") if (a.get(k) or "").strip()]


def document(doc_id: str) -> Optional[dict]:
    meta = item(doc_id)
    if not meta:
        return None
    arts = articles_of(doc_id)
    # Sommaire : suite des intitulés (livre › titre › chapitre › section) avec l'index du 1er article
    toc: list[dict] = []
    last: list[str] = []
    for i, a in enumerate(arts):
        h = _heading(a)
        if h and h != last:
            depth = 0
            while depth < min(len(h), len(last)) and h[depth] == last[depth]:
                depth += 1
            for level in range(depth, len(h)):
                toc.append({"titre": h[level], "niveau": level, "index": i,
                            "article_ref": a.get("article_ref", "")})
            last = h
    return {**meta, "sommaire": toc[:600], "relations": relations(doc_id)}


def _article_out(doc_id: str, i: int, a: dict, cites: Counter) -> dict:
    num = _ref_num(a.get("article_ref", ""))
    return {
        "index": i,
        "article_ref": a.get("article_ref", ""),
        "rubrique": " › ".join(_heading(a)),
        "texte": a.get("texte", ""),
        "note": a.get("note", ""),
        "source_url": a.get("source_url", ""),
        "decisions": cites.get(num, 0) if num else 0,
    }


def _ref_num(ref: str) -> Optional[str]:
    m = re.search(r"(\d+(?:[.\-]\d+)*)", ref or "")
    return m.group(1) if m else None


def document_articles(doc_id: str, offset: int = 0, limit: int = 50, q: str = "") -> dict:
    arts = articles_of(doc_id)
    cites = _citations_index().get(doc_id, Counter())
    indexed = list(enumerate(arts))
    if q:
        nq = _norm(q)
        m = re.fullmatch(r"(?:art(?:icle)?\s*)?(\d+(?:\s\d+)*)", nq)
        if m:   # recherche par numéro : « 383 », « art 58-3 »
            wanted = m.group(1).replace(" ", "-")
            indexed = [(i, a) for i, a in indexed
                       if (_ref_num(a.get("article_ref", "")) or "").replace(".", "-") == wanted]
        else:
            terms = nq.split()
            indexed = [(i, a) for i, a in indexed
                       if all(t in _norm(a.get("texte", "") + " " + " ".join(_heading(a))) for t in terms)]
    total = len(indexed)
    page = indexed[offset: offset + limit]
    return {"total": total, "offset": offset, "limit": limit,
            "articles": [_article_out(doc_id, i, a, cites) for i, a in page]}


def search_articles(q: str, limit: int = 30, doc_id: str = "") -> dict:
    """Recherche plein texte (tous les mots) dans les textes en vigueur."""
    nq = _norm(q)
    terms = [t for t in nq.split() if len(t) > 1]
    if not terms:
        return {"query": q, "total": 0, "results": []}
    metas = {m["doc_id"]: m for m in _items()}
    results = []
    phrase = " ".join(terms)
    for did, meta in metas.items():
        if doc_id and did != doc_id:
            continue
        if not doc_id and not meta["indexe"]:
            continue        # recherche globale : textes en vigueur, généraux et complets
        arts = articles_of(did)
        boost = 3 if meta["famille"] in MAIN_FAMILIES else 0
        for i, hay in enumerate(_normed_texts(did)):
            if all(t in hay for t in terms):
                # Expression exacte répétée > mots épars ; à score égal, l'article le plus ciblé (court) d'abord
                score = sum(min(hay.count(t), 5) for t in terms) + 6 * min(hay.count(phrase), 4) + boost \
                    - min(len(hay) / 4000, 2)
                results.append((score, did, i, arts[i]))
    total = len(results)
    results.sort(key=lambda r: -r[0])
    out = []
    for score, did, i, a in results[:limit]:
        out.append({"doc_id": did, "nom": metas[did]["nom"], "index": i,
                    "article_ref": a.get("article_ref", ""), "rubrique": " › ".join(_heading(a)),
                    "extrait": _snippet(a.get("texte", ""), terms), "source_url": a.get("source_url", "")})
    return {"query": q, "total": total, "results": out}


def _snippet(text: str, terms: list[str], width: int = 260) -> str:
    n = _norm(text)
    pos = n.find(terms[0]) if terms else -1
    if pos < 0:
        return text[:width] + ("…" if len(text) > width else "")
    # Position approximative dans le texte d'origine (même longueur à peu près)
    start = max(0, int(pos * len(text) / max(1, len(n))) - width // 3)
    snippet = text[start:start + width]
    return ("…" if start else "") + snippet + ("…" if start + width < len(text) else "")


# ── Jurisprudence ────────────────────────────────────────────────────────────

def _decision_summary(d: dict) -> dict:
    return {k: d.get(k) for k in ("id", "titre", "type", "juridiction", "chambre", "date", "annee",
                                  "numero", "matiere", "objet", "parties", "source_url")} | {
        "extrait": (d.get("sommaire") or d.get("dispositif") or "")[:420],
        "nb_articles_cites": len(d.get("articles_cites") or []),
        "longueur": d.get("longueur", 0),
    }


def search_decisions(q: str = "", juridiction: str = "", matiere: str = "", annee: Optional[int] = None,
                     sort: str = "recent", offset: int = 0, limit: int = 20,
                     doc_id: str = "", article: str = "") -> dict:
    decs = decisions()
    items = decs
    if juridiction:
        items = [d for d in items if d.get("juridiction", "").startswith(juridiction)]
    if matiere:
        items = [d for d in items if d.get("matiere") == matiere]
    if annee:
        items = [d for d in items if d.get("annee") == annee]
    if doc_id:
        items = [d for d in items if any(c.get("doc_id") == doc_id and (not article or c.get("article") == article)
                                         for c in d.get("articles_cites") or [])]
    if q:
        terms = [t for t in _norm(q).split() if len(t) > 1]
        scored = []
        for d in items:
            head = _norm(" ".join([d.get("titre", ""), d.get("objet", ""), d.get("sommaire", ""),
                                   d.get("juridiction", ""), d.get("matiere", "")]))
            body = _norm(d.get("texte", ""))
            if all(t in head or t in body for t in terms):
                scored.append((sum(head.count(t) * 5 + body.count(t) for t in terms), d))
        scored.sort(key=lambda x: -x[0])
        items = [d for _, d in scored]
    if sort == "ancien":
        items = sorted(items, key=lambda d: d.get("date") or "")
    elif sort == "recent" or (sort == "pertinence" and not q):
        items = sorted(items, key=lambda d: d.get("date") or "", reverse=True)
    # sort == "pertinence" avec une recherche : ordre du score ci-dessus
    facets = {
        "juridictions": Counter(_court_family(d.get("juridiction", "")) for d in decs).most_common(),
        "matieres": Counter(d.get("matiere", "") for d in decs).most_common(),
        "annees": sorted({d.get("annee") for d in decs if d.get("annee")}, reverse=True),
    }
    return {"total": len(items), "offset": offset, "limit": limit,
            "decisions": [_decision_summary(d) for d in items[offset: offset + limit]],
            "facets": facets, "total_corpus": len(decs)}


def _court_family(j: str) -> str:
    return "Tribunal de première instance" if j.startswith("Tribunal") else j


def decision(dec_id: str) -> Optional[dict]:
    d = next((x for x in decisions() if x.get("id") == dec_id), None)
    if not d:
        return None
    metas = {m["doc_id"]: m for m in metadata()}
    cites = []
    for c in d.get("articles_cites") or []:
        m = metas.get(c.get("doc_id") or "")
        cites.append({**c, "doc_nom": _clean_name(m.get("nom", "")) if m else "",
                      "statut": m.get("statut", "") if m else ""})
    same = [x for x in decisions() if x["id"] != dec_id and x.get("matiere") == d.get("matiere")
            and x.get("juridiction") == d.get("juridiction")]
    same.sort(key=lambda x: abs((x.get("annee") or 0) - (d.get("annee") or 0)))
    return {**d, "articles_cites": cites, "similaires": [_decision_summary(x) for x in same[:4]]}


def article_text(doc_id: str, article_num: str) -> Optional[dict]:
    """Texte d'un article par numéro (pour relier une décision au texte cité)."""
    for i, a in enumerate(articles_of(doc_id)):
        if (_ref_num(a.get("article_ref", "")) or "").replace(".", "-") == article_num.replace(".", "-"):
            return {"doc_id": doc_id, "index": i, "article_ref": a.get("article_ref", ""),
                    "texte": a.get("texte", ""), "note": a.get("note", ""), "source_url": a.get("source_url", "")}
    return None


def company_guide() -> Optional[dict]:
    guide = _load(_corpus() / "guides" / "creation_entreprise.json", None)
    if not guide:
        return None
    ids = _load(_corpus() / "sources" / "droitguineen_ids.json", {})
    textes = [{**t, "doc_id": ids.get(t.get("slug", ""), "")} for t in guide.get("textes", [])]
    return {**guide, "textes": textes}


def warmup() -> None:
    """Charge le catalogue et normalise les textes une fois (premières recherches instantanées)."""
    try:
        _items()
        for i in _items():
            if i["indexe"]:
                _normed_texts(i["doc_id"])
        catalog()
    except Exception:  # noqa: BLE001 — un échec ici ne doit pas empêcher le démarrage
        pass


# ── Journal officiel ─────────────────────────────────────────────────────────

def journal() -> list[dict]:
    return _load(_corpus() / "journal_officiel" / "numeros.json", [])


def journal_list(annee: Optional[int] = None, q: str = "", offset: int = 0, limit: int = 24) -> dict:
    nums = journal()
    years = sorted({int(n["date"][:4]) for n in nums if n.get("date")}, reverse=True)
    items = nums
    if annee:
        items = [n for n in items if (n.get("date") or "").startswith(str(annee))]
    if q:
        terms = [t for t in _norm(q).split() if len(t) > 1]
        items = [n for n in items if all(t in _norm(" ".join(e["intitule"] for e in n["entrees"]) + " " + n["titre"])
                                         for t in terms)]
    out = []
    for n in items[offset: offset + limit]:
        natures = Counter(e.get("nature") or "Autre" for e in n["entrees"])
        out.append({k: n[k] for k in ("id", "numero", "special", "date", "titre", "theme", "source_url")} | {
            "nb_textes": len(n["entrees"]),
            "nb_relies": sum(1 for e in n["entrees"] if e.get("doc_id")),
            "natures": natures.most_common(),
            "apercu": [e["intitule"] for e in n["entrees"][:3]],
        })
    return {"total": len(items), "offset": offset, "limit": limit, "annees": years, "numeros": out}


def journal_issue(issue_id: str) -> Optional[dict]:
    n = next((x for x in journal() if x["id"] == issue_id), None)
    if not n:
        return None
    names = {i["doc_id"]: i for i in _items()}
    entries = []
    for e in n["entrees"]:
        t = names.get(e.get("doc_id") or "")
        entries.append({**e, "famille": t["famille"] if t else "", "famille_label": t["famille_label"] if t else "",
                        "indexe": t["indexe"] if t else False})
    return {**n, "entrees": entries}


# ── Droit OHADA ──────────────────────────────────────────────────────────────

def ohada_hub() -> dict:
    items = [i for i in _items() if i["categorie"] == "Droit OHADA"]
    actes = [i for i in items if "ACTE UNIFORME" in (i["type"] or "").upper() and i["statut"] == "en_vigueur"]
    textes = [i for i in items if i not in actes]
    ccja = [d for d in decisions() if d.get("juridiction", "").startswith("CCJA")]
    ccja.sort(key=lambda d: d.get("date") or "", reverse=True)
    return {
        "actes": sorted(actes, key=lambda i: -i["articles"]),
        "textes": sorted(textes, key=lambda i: (i["statut"] != "en_vigueur", i["nom"])),
        "decisions_ccja": [_decision_summary(d) for d in ccja[:12]],
        "total_ccja": len(ccja),
        "total_articles": sum(i["articles"] for i in actes),
    }


# ── Tableau de bord et chiffres ──────────────────────────────────────────────

def stats() -> dict:
    items = _items()
    indexed = [i for i in items if i["indexe"]]
    recent = sorted((i for i in items if i["famille"] not in ("individuel", "promulgation") and i["date"]),
                    key=lambda i: i["date"], reverse=True)[:8]
    decs = sorted(decisions(), key=lambda d: d.get("date") or "", reverse=True)[:5]
    jo = journal()[:4]
    return {
        "textes_en_vigueur": len(indexed),
        "articles": sum(i["articles"] for i in indexed),
        "textes_total": len(items),
        "codes_et_lois": sum(1 for i in items if i["famille"] in MAIN_FAMILIES and i["indexe"]
                             and "GUIDE" not in i["type"].upper()),
        "actes_uniformes": sum(1 for i in items if "ACTE UNIFORME" in i["type"].upper() and i["statut"] == "en_vigueur"),
        "decisions": len(decisions()),
        "numeros_jo": len(journal()),
        "derniers_textes": recent,
        "dernieres_decisions": [_decision_summary(d) for d in decs],
        "derniers_jo": [{k: n[k] for k in ("id", "numero", "special", "date", "titre", "theme")} | {"nb_textes": len(n["entrees"])}
                        for n in jo],
    }


def public_figures() -> dict:
    """Chiffres publics (page d'accueil) : uniquement des comptes, aucun contenu."""
    s = stats()
    main = sorted((i for i in _items() if i["indexe"] and i["famille"] in MAIN_FAMILIES and "GUIDE" not in i["type"].upper()),
                  key=lambda i: -i["articles"])[:10]
    return {k: s[k] for k in ("textes_en_vigueur", "articles", "textes_total", "codes_et_lois", "actes_uniformes",
                              "decisions", "numeros_jo")} | {
        "principaux_textes": [{"titre": i["nom"], "annee": i["annee"], "articles": i["articles"]} for i in main],
    }


def quick_search(q: str) -> dict:
    """Recherche éclair (palette ⌘K) : textes par titre, articles par contenu, décisions."""
    terms = [t for t in _norm(q).split() if len(t) > 1]
    if not terms:
        return {"textes": [], "articles": [], "decisions": []}
    textes = [i for i in _items() if all(t in _norm(f"{i['nom']} {i['numero']}") for t in terms)]
    textes.sort(key=lambda i: (not i["indexe"], i["famille"] not in MAIN_FAMILIES, -(i["articles"])))
    arts = search_articles(q, limit=5)["results"]
    decs = search_decisions(q=q, sort="pertinence", limit=4)["decisions"]
    return {
        "textes": [{k: i[k] for k in ("doc_id", "nom", "type", "numero", "annee", "famille_label")} for i in textes[:5]],
        "articles": arts,
        "decisions": decs,
    }

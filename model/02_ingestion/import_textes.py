"""
Textes officiels collectés (lois, ordonnances, décrets, arrêtés, décisions, traités)
et Journal officiel — appelé par import_droitguineen.py.

Rien n'est rédigé : on découpe en articles, on classe, on contrôle et on relie.

Classement (famille) — décide de l'usage du texte :
  loi / constitution / traite / convention  → règles générales, indexées
  reglementaire                              → décrets, arrêtés… généraux, indexés
  organisation                               → création, attributions d'organismes, indexés
  ratification / promulgation / individuel   → consultables, jamais utilisés pour répondre
                                               (nominations, agréments, permis, promotions…)

Contrôles qualité (un texte qui échoue reste consultable mais n'est pas indexé) :
  incoherent      le corps parle d'un autre type d'acte que le titre (erreur de la source)
  debut_manquant  le texte commence après l'article 1
  vide            aucun contenu exploitable
"""

from __future__ import annotations

import re
import sys
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import droitguineen as dg  # noqa: E402

INDEXED_FAMILIES = {"loi", "constitution", "traite", "convention", "reglementaire", "organisation"}

FAMILY_LABELS = {
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

# Textes de la catégorie « textes » déjà intégrés autrement (codes, Actes uniformes) : ignorés ici
SKIP_NATURES = {"Code", "Acte Uniforme OHADA"}

# Textes de base modifiés par un texte collecté à part : restent indexés, avec un renvoi
AMENDED_NOTES = {
    "reglement-procedure-ccja-1996": "Version de 1996, modifiée en 2014 : voir « Règlement de procédure CCJA — Modification de 2014 ».",
    "traite-ohada-port-louis-1993": "Traité fondateur, révisé par le Traité de Québec du 17 octobre 2008 (voir ce texte).",
}

# Numéros des textes du corpus historique (PDF) qui sont les mêmes lois : fusion, pas de doublon
OUR_SAME_LAWS = {
    "loi-constitutionnelle-d-2025-176-prg-constitution": "doc_011",
    "loi-l-2015-019-an-organisation-judiciaire": "doc_025",
    "loi-u2023-0008-cnt-portant-statut-general-des-autorites-administrativ": "doc_027",   # préfixe (slug tronqué)
    "loi-l-2023-019-cnt-identification-des-personnes-physiques": "doc_028",
}

_NATURE_RE = re.compile(r"^\s*(?P<nature>[^.]+?)\s+(?:n°\s*(?P<num>\S+)\s+)?du\s+(?P<date>\d{1,2}(?:er)?\s+\S+\s+\d{4})")
_NUMERO_RE = re.compile(
    r"\b(?P<p>LO|L|D|A|O|N)\s*/\s*(?P<y>(?:19|20)?\d{2})\s*/\s*(?P<n>\d{1,5})(?P<rest>(?:\s*/\s*[A-Z][A-Za-z\-]*)*)")


def _fold(text: str) -> str:
    t = unicodedata.normalize("NFKD", (text or "").lower())
    t = "".join(c for c in t if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", t).strip()


def numero_key(text: str) -> tuple | None:
    """« D/2026/158/PRG/SGG », « L/2023/0019/CNT », « U2023/0008 » → ('D', 2026, 158)."""
    t = (text or "").upper().replace("U20", "L/20").replace("\\", "/")
    m = _NUMERO_RE.search(t)
    if not m:
        return None
    y = int(m.group("y"))
    if y < 100:
        y += 1900 if y > 30 else 2000
    p = "L" if m.group("p") == "LO" else m.group("p")
    return (p, y, int(m.group("n")))


def emetteur(numero: str) -> str:
    """Sigle de l'autorité qui signe (« A/2026/029/MMG/SGG » → « MMG »)."""
    parts = [p for p in re.split(r"\s*/\s*", numero or "")[3:] if p]
    generic = {"SGG", "CAB", "SG", "PRG", "CNRD", "CNT", "AN", "CTRN", "PM"}
    specific = [p for p in parts if p.upper() not in generic]
    if specific:
        return specific[0]
    if "PM" in [p.upper() for p in parts]:
        return "PM"
    if "PRG" in [p.upper() for p in parts]:
        return "PRG"
    return parts[0] if parts else ""


_PRESENT_RE = re.compile(r"(?i)\b(?:la|le|cette|ce)\s+pr[ée]sente?\s+(loi|d[ée]cret|arr[êe]t[ée]|d[ée]cision|instruction|ordonnance)")
_NATURE_WORD = {"Arrêté": "arrete", "Décret": "decret", "Loi": "loi", "Loi organique": "loi", "Décision": "decision",
                "Instruction": "instruction", "Ordonnance": "ordonnance"}


def coherent(nature: str, body: str) -> bool:
    """Le corps cite-t-il bien le même type d'acte que le titre ? (sinon : erreur de la source)."""
    expected = _NATURE_WORD.get(nature)
    if not expected:
        return True
    found = {_fold(m.group(1)) for m in _PRESENT_RE.finditer(body)}
    if not found:
        return True
    if expected in found:
        return True
    # Décret de promulgation qui cite la loi, ou loi suivie de son décret de promulgation
    if "promulg" in _fold(body) and ({expected, *found} <= {"loi", "decret"}):
        return True
    return False


_PROMULG = re.compile(r"\bpromulgation\b")
_RATIF = re.compile(r"\b(ratification|ratifiant|adhesion|accord de (pret|financement|credit|don)|approbation (de l |d un |du |de la )?(accord|convention|protocole))\b")
_INDIV = re.compile(
    r"\b(nomination|nommant|nommes?|affectation|retrait|mise en (retraite|disponibilite|position|conge|stage)|elevation|"
    r"avancement|promotion|limogeage|agrement|autorisation|prorogation|annulation|concession|octroi|"
    r"attribution (d un|d une|de la|du|de|des) (permis|titre|licence|lot|parcelle|terrain|bourse|prime|marche|concession|"
    r"autorisation|agrement|dignite|grade|medaille|distinction|zone|perimetre)|virement|decoration|ordre national|merite|"
    r"grace|remise de peine|naturalisation|dissolution|suspension|revocation|radiation|integration|titularisation|"
    r"detachement|reconnaissance|delegation de signature|prise effective|admission|reintegration|maintien d un|rapportant|"
    r"refus|rejet|utilite publique|designation|equivalence|accreditation|liste des|nomme)\b")
_ORG = re.compile(r"\b(attributions?|organisation|organisa tion|fonctionnement|creation|missions?|composition|"
                  r"structure du gouvernement|statuts? (de l|du|de la|d un|des)|institution d)\b")


def classify(nature: str, title: str, slug: str, body: str) -> str:
    head = _fold(f"{title} {slug.replace('-', ' ')}")
    start = _fold(body[:600])
    if nature == "Constitution":
        return "constitution"
    if nature.startswith("Traité") or nature.startswith("Règlement OHADA"):
        return "traite"
    if nature == "Convention":
        return "convention"
    if _PROMULG.search(head):
        return "promulgation"
    if _RATIF.search(head):
        return "ratification"
    if nature in ("Loi", "Loi organique", "Ordonnance"):
        if re.search(r"\b(est|sont) nommes?\b", start):
            return "individuel"
        return "loi"
    if _INDIV.search(head) or re.search(r"\b(est|sont) nommes?\b", start):
        return "individuel"
    if _ORG.search(head):
        return "organisation"
    return "reglementaire"


_MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre",
         "octobre", "novembre", "décembre"]


def compose_title(nature: str, numero: str, date_iso: str, title: str) -> str:
    """Intitulé lisible quand le Journal officiel ne donne pas le titre complet.

    « Arrêté A/2024/1285 : Autorisation » → « Arrêté A/2024/1285/MS/CAB du 5 mars 2024 — Autorisation »
    « Fixant les dates des scrutins… » → « Décret D/2026/301/PRG/SGG du 12 octobre 2026 — Fixant les dates… »
    """
    objet = title.split(" : ", 1)[1] if " : " in title else title
    if re.match(r"(?i)^(arr[êe]t[ée]|d[ée]cret|loi|d[ée]cision|instruction|ordonnance)\b", objet) and " : " not in title:
        return title                      # le titre est déjà un intitulé complet
    objet = objet.rstrip("… .")
    if objet.lower() in ("texte intégral", ""):
        objet = ""
    date_txt = ""
    if re.match(r"\d{4}-\d{2}-\d{2}", date_iso or ""):
        y, m, d = date_iso.split("-")
        date_txt = f" du {int(d)}{'er' if d == '01' else ''} {_MOIS[int(m) - 1]} {y}"
    head = " ".join(filter(None, [nature, numero])) + date_txt
    return f"{head} — {objet[0].upper() + objet[1:]}" if objet else head


def split_articles(body: str) -> list[tuple[str, str]]:
    arts = dg.split_full_page(body)
    if arts:
        return arts
    text = dg.clean_running_headers("\n".join(dg.repair_lines(body.split("\n"))).strip())
    return [("texte", text)] if len(text) >= 30 else []


def parse_journal(items: list[dict]) -> list[dict]:
    """Numéros du Journal officiel : sommaire structuré (une entrée par texte publié)."""
    numeros = []
    for it in items:
        doc = dg.load_json(dg.DATA_DIR / it["file"])
        title = (doc.get("title") or "").replace(" | Droitguinéen", "").strip()
        m = re.match(r"Journal Officiel N°\s*(?P<num>[\w\-]+)\s*(?P<spec>\(spécial\))?\s+du\s+(?P<date>.+)$", title)
        if not m:
            continue                     # pages annuelles (index) : ignorées
        body = dg.strip_footer(doc.get("content", ""))
        entries = []
        for line in body.split("\n"):
            line = line.strip()
            pm = re.search(r"p\.\s*(\d+)\s*$", line)
            if not pm or len(line) < 15:
                continue
            text = line[: pm.start()].strip()
            text = re.sub(r"[.\s]+l[’']assembl[ée]e nationale\s*$", ".", text, flags=re.I).rstrip()
            text = re.sub(r"^(Arrêté|Décret|Loi|Décision|Instruction|Ordonnance)(?=[A-ZÉ])", r"\1 ", text)
            nat = re.match(r"(Loi organique|Loi ORDINAIRE|Loi|Ordonnance|Décret|Arrêté|Décision|Instruction|Avis|Communiqué)", text, re.I)
            nature = nat.group(1).capitalize().replace("Loi ordinaire", "Loi") if nat else ""
            entries.append({
                "nature": nature,
                "intitule": text,
                "page": int(pm.group(1)),
                "cle": numero_key(text),
            })
        theme = ""
        lines = [l.strip() for l in body.split("\n") if l.strip()]
        if len(lines) > 1 and lines[1].isupper() and lines[1] not in ("JO",):
            theme = lines[1].capitalize()
        numeros.append({
            "id": doc.get("path", "").rstrip("/").split("/")[-1],
            "numero": m.group("num"),
            "special": bool(m.group("spec")),
            "date": dg.parse_fr_date(m.group("date")),
            "titre": title,
            "theme": theme,
            "source_url": doc.get("canonical_url") or doc.get("source_url"),
            "entrees": entries,
        })
    numeros.sort(key=lambda n: (n["date"], n["numero"]), reverse=True)
    return numeros


def _domain(title: str, body: str) -> str:
    try:
        from rag import detect_domain  # noqa: WPS433 — même détection que le moteur de réponse
    except Exception:  # pragma: no cover
        return "Administration"
    return detect_domain(f"{title}. {body[:800]}") or "Administration"


def build_textes(metadata: list[dict], ids: dict, outputs: dict, report: dict, merge_fn, record_fn) -> list[dict]:
    """Construit les documents « textes officiels ». Retourne les numéros du Journal officiel."""
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "04_pipeline"))
    meta_by_id = {m["doc_id"]: m for m in metadata}
    journal = parse_journal(dg.manifest_items("journal_officiel"))
    jo_by_key: dict[tuple, list[dict]] = defaultdict(list)
    for n in journal:
        for e in n["entrees"]:
            if e["cle"]:
                jo_by_key[tuple(e["cle"])].append({"jo": n["id"], "numero": n["numero"], "date": n["date"],
                                                  "page": e["page"], "intitule": e["intitule"]})

    used_nums = {int(i.split("_")[1]) for i in list(meta_by_id) + list(ids.values()) if re.fullmatch(r"doc_\d+", i)}
    next_num = max([n for n in used_nums if n >= 1000] + [1000]) + 1
    stats = Counter()
    fam_counts = Counter()
    quality = Counter()
    issues = []
    key_to_doc: dict[tuple, str] = {}

    for it in dg.manifest_items("textes"):
        doc = dg.load_json(dg.DATA_DIR / it["file"])
        slug = (doc.get("path") or "").rstrip("/").split("/")[-1]
        desc = doc.get("description") or ""
        nm = _NATURE_RE.match(desc)
        nature = nm.group("nature").strip() if nm else ""
        if nature in SKIP_NATURES:
            stats["deja_integres"] += 1
            continue
        if nature.startswith("Traité. "):
            nature = "Traité"
        if nature.startswith("Consultez"):
            nature = "Décret"
        numero = (nm.group("num") if nm and nm.group("num") else "").rstrip(".")
        date_iso = dg.parse_fr_date(nm.group("date")) if nm else ""
        title = (doc.get("title") or "").replace(" | Droitguinéen", "").strip()
        body = dg.strip_footer(doc.get("content", ""))
        key = numero_key(numero) if numero else None
        jo_refs = jo_by_key.get(tuple(key), []) if key else []
        intitule = jo_refs[0]["intitule"] if jo_refs else compose_title(nature, numero, date_iso, title)
        url = doc.get("canonical_url") or doc.get("source_url") or f"{dg.SITE}/lois/{slug}"

        arts = split_articles(body)
        famille = classify(nature, intitule, slug, body)
        if famille in ("traite", "convention"):
            # Titre de la page (« Traité OHADA de Québec — Traité révisé (2008) ») : la date de la
            # description est parfois fausse à la source (Québec daté de 1993).
            intitule = title
        problems = []
        if not arts:
            problems.append("vide")
        elif not coherent(nature, body):
            problems.append("incoherent")
        elif arts[0][0] not in ("1", "texte") and famille in INDEXED_FAMILIES:
            problems.append("debut_manquant")
        for p in problems:
            quality[p] += 1
            issues.append({"slug": slug, "titre": title, "probleme": p, "url": url})

        # Même loi que l'un de nos textes historiques : fusion (nos articles restent la référence)
        same = next((d for pre, d in OUR_SAME_LAWS.items() if slug.startswith(pre)), None)
        if same:
            doc_id = same
            theirs = [{"num": n, "article_ref": f"Article {n.replace('-', ' ')}", "texte": t, "source_url": url}
                      for n, t in arts if n != "texte"]
            outputs[doc_id] = merge_fn(doc_id, theirs, report)
            m = meta_by_id[doc_id]
            m.setdefault("url_droitguineen", url)
            if numero and not m.get("numero"):
                m["numero"] = numero
            if jo_refs:
                m["journal_officiel"] = jo_refs[:3]
            stats["fusionnes"] += 1
            if key:
                key_to_doc[tuple(key)] = doc_id
            continue

        doc_id = ids.get(slug)
        if not doc_id:
            doc_id = f"doc_{next_num}"
            next_num += 1
            ids[slug] = doc_id
        records = []
        for n, t in arts:
            ref = "Texte" if n == "texte" else f"Article {n.replace('-', ' ')}"
            records.append(record_fn(doc_id, {"article_ref": ref, "texte": t, "source_url": url}))
        outputs[doc_id] = records
        indexe = famille in INDEXED_FAMILIES and not problems
        lang = "en" if re.search(r"\b(the|shall|of the|and the)\b", body[:2000]) and nature == "Traité" else "fr"
        entry = {
            "doc_id": doc_id,
            "nom": intitule if len(intitule) <= 400 else intitule[:397] + "…",
            "titre_court": title,
            "type": nature.upper() if nature else "TEXTE",
            "nature": nature or "Texte",
            "famille": famille,
            "numero": numero,
            "emetteur": emetteur(numero),
            "date_adoption": date_iso[:4],
            "date_promulgation": date_iso,
            "nombre_pages": 0,
            "source_pdf": "",
            "source_officielle": "droitguineen.com (reproduction du Journal officiel)",
            "url_source": url,
            "url_droitguineen": url,
            "domaine": _domain(intitule, body) if indexe else "Administration",
            "statut": "en_vigueur",
            "indexe": indexe,
            "qualite": problems,
            "langue": lang,
            "journal_officiel": jo_refs[:3],
            "verification_status": "source_web",
            "collecte_le": (doc.get("retrieved_at") or "")[:10],
        }
        if slug in AMENDED_NOTES:
            entry["note"] = AMENDED_NOTES[slug]
        if doc_id in meta_by_id:
            meta_by_id[doc_id].clear()
            meta_by_id[doc_id].update(entry)
        else:
            metadata.append(entry)
            meta_by_id[doc_id] = entry
        if key:
            key_to_doc[tuple(key)] = doc_id
        fam_counts[famille] += 1
        stats["indexes" if indexe else "consultables"] += 1

    # Les entrées du Journal officiel pointent vers nos documents quand on les a
    linked = 0
    total_entries = 0
    for n in journal:
        for e in n["entrees"]:
            total_entries += 1
            e["doc_id"] = key_to_doc.get(tuple(e["cle"])) if e["cle"] else None
            linked += bool(e["doc_id"])
            e["cle"] = "/".join(map(str, e["cle"])) if e["cle"] else ""

    report["textes"] = {
        "stats": dict(stats), "familles": dict(fam_counts), "qualite": dict(quality),
        "journal": {"numeros": len(journal), "entrees": total_entries, "reliees": linked},
    }
    report["textes_problemes"] = issues
    return journal


# ── Relations entre textes ───────────────────────────────────────────────────

_REL_VERBS = [
    ("modifie", re.compile(r"(?i)\b(modifi\w*|compl[ée]t\w*|amend\w*)\b")),
    ("abroge", re.compile(r"(?i)\babrog\w*\b")),
    ("applique", re.compile(r"(?i)\b(application|applicable|pris en application|portant application)\b")),
]


def build_relations(metadata: list[dict], outputs: dict, articles_loader) -> dict:
    """Liens entre textes repérés dans leurs propres dispositions (numéros cités).

    { doc_id: { "cite": [...], "cite_par": [...] } } — chaque lien garde l'article et le
    verbe (« modifie », « abroge », « applique », « cite ») : on affiche, on ne conclut pas.
    """
    key_to_doc = {}
    for m in metadata:
        k = numero_key(m.get("numero", ""))
        if k:
            key_to_doc.setdefault(tuple(k), m["doc_id"])
    rel: dict[str, dict] = defaultdict(lambda: {"cite": [], "cite_par": []})
    for m in metadata:
        did = m["doc_id"]
        arts = outputs.get(did) or articles_loader(did)
        own = numero_key(m.get("numero", ""))
        seen = set()
        for a in arts:
            texte = a.get("texte", "")
            for mm in _NUMERO_RE.finditer(texte.upper()):
                k = numero_key(mm.group(0))
                if not k or (own and tuple(k) == tuple(own)):
                    continue
                target = key_to_doc.get(tuple(k))
                if not target or target == did or (target, a.get("article_ref")) in seen:
                    continue
                seen.add((target, a.get("article_ref")))
                window = texte[max(0, mm.start() - 160): mm.end() + 40]
                kind = next((name for name, rx in _REL_VERBS if rx.search(window)), "cite")
                rel[did]["cite"].append({"doc_id": target, "type": kind, "article": a.get("article_ref", "")})
                rel[target]["cite_par"].append({"doc_id": did, "type": kind, "article": a.get("article_ref", "")})
    return {k: v for k, v in rel.items()}

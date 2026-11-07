"""
Intégration de la collecte droitguineen.com dans le corpus JusticIA.

    backend/env/bin/python model/02_ingestion/import_droitguineen.py --report-only
    backend/env/bin/python model/02_ingestion/import_droitguineen.py

Ce que fait le script (aucun texte n'est rédigé : tout est repris tel quel) :

1. Codes et Actes uniformes OHADA collectés article par article
   - texte déjà présent dans notre corpus et validé → on garde nos articles,
     on ajoute ceux qui nous manquaient et on répare ceux que notre extraction
     PDF avait fusionnés avec l'article suivant ;
   - notre version issue d'un OCR à réviser → remplacée par la version collectée ;
   - nouveau texte → nouveau document du corpus (doc_035, doc_036…).
2. Statut des textes : abrogé / projet / version historique / doublon, avec la
   disposition qui le prouve. Ces textes restent consultables mais ne sont
   plus indexés pour les réponses.
3. Jurisprudence : 155 décisions structurées (juridiction, date, parties,
   objet, sommaire, dispositif, articles cités) → corpus/jurisprudence/.
4. Guide « Créer une entreprise » (guichet unique APIP/GDB, fiches 2026).
5. Rapport d'harmonisation → corpus/reports/.

Les identifiants attribués sont conservés dans corpus/sources/droitguineen_ids.json
pour rester stables d'une exécution à l'autre.
"""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import droitguineen as dg  # noqa: E402

MODEL_DIR = Path(__file__).resolve().parents[1]
CORPUS_DIR = MODEL_DIR / "corpus"
ARTICLES_DIR = CORPUS_DIR / "articles"
METADATA_FILE = CORPUS_DIR / "metadata.json"
JURIS_DIR = CORPUS_DIR / "jurisprudence"
REPORTS_DIR = CORPUS_DIR / "reports"
IDS_FILE = CORPUS_DIR / "sources" / "droitguineen_ids.json"
GUIDES_DIR = CORPUS_DIR / "guides"

SOURCE_LABEL = "droitguineen.com (reproduction du Journal officiel)"
OHADA_LABEL = "OHADA — Actes uniformes (reproduits par droitguineen.com)"

# Corpus validé de référence (avant intégration) : le script repart toujours de lui
BASELINE_REF = "bcb6b5b"

# Statuts pour lesquels un texte n'est PAS indexé pour les réponses
NOT_INDEXED = {"abroge", "projet", "historique", "doublon"}

# ── Table des textes collectés ───────────────────────────────────────────────
# slug droitguineen → (doc_id existant ou None, nom affiché, type, domaine, statut, note)
# Domaines : ceux déjà utilisés par la détection de domaine du moteur (rag.py).
CODES: dict[str, dict] = {
    # Textes déjà présents dans notre corpus (même loi)
    "code-civil-guineen-2019": {"doc": "doc_032", "mode": "fusion"},
    "code-l-2016-060-an-code-de-procedure-penale": {"doc": "doc_020", "mode": "fusion"},
    "code-l-2019-0059-an-code-de-lenfant": {"doc": "doc_005", "mode": "fusion"},
    "code-l-2016-059-an-code-penal": {"doc": "doc_008", "mode": "fusion"},
    "code-l-2019-012-an-code-maritime": {"doc": "doc_031", "mode": "fusion"},
    "code-l-2014-072-cnt-code-du-travail": {"doc": "doc_023", "mode": "fusion"},
    "code-2011-06-code-minier": {"doc": "doc_007", "mode": "fusion"},
    "code-092-019-code-foncier-et-domanial": {"doc": "doc_006", "mode": "fusion"},
    "code-l-2014-034-an-code-petrolier": {"doc": "doc_016", "mode": "fusion"},
    "code-de-conduite-de-l-agent-public": {"doc": "doc_002", "mode": "fusion"},
    "code-conduite-forces-defense-2011": {"doc": "doc_019", "mode": "fusion"},
    # Notre version vient d'un OCR marqué « à réviser » : la version collectée la remplace
    "code-securite-sociale": {"doc": "doc_034", "mode": "remplacement",
                              "nom": "Code de la sécurité sociale (partie législative)"},
    # Nouveaux textes
    "code-general-des-impots": {"nom": "Code général des impôts", "type": "CODE", "domaine": "Fiscalité"},
    "code-electoral-2025": {"nom": "Code électoral", "type": "LOI ORGANIQUE", "domaine": "Droit électoral"},
    "code-environnement": {"nom": "Code de l'environnement", "type": "CODE", "domaine": "Environnement"},
    "code-marches-publics-2019": {"nom": "Code des marchés publics", "type": "DECRET", "domaine": "Marchés publics"},
    "code-bcrg-2017-recueil-bancaire-et-financier-bcrg": {"nom": "Recueil bancaire et financier (BCRG)", "type": "RECUEIL", "domaine": "Finance"},
    "code-securite-sociale-1994-reglementaire": {"nom": "Code de la sécurité sociale (partie réglementaire)", "type": "DECRET", "domaine": "Sécurité sociale"},
    "code-l-2017-037-an-code-de-justice-militaire": {"nom": "Code de justice militaire", "type": "CODE", "domaine": "Justice"},
    "code-d-98-100-prg-sgg-code-de-procedure-civile-economique-et-administrative": {"nom": "Code de procédure civile, économique et administrative", "type": "CODE", "domaine": "Justice"},
    "code-l-2018-023-an-code-de-la-route": {"nom": "Code de la route", "type": "CODE", "domaine": "Transport et commerce"},
    "code-l-2016-034-an-code-des-assurances": {"nom": "Code des assurances", "type": "CODE", "domaine": "Commerce et assurances"},
    "code-l-95-022-ctrn-code-des-assurances-de-la-republique-de-guinee-1995": {"nom": "Code des assurances (1995)", "type": "CODE", "domaine": "Commerce et assurances"},
    "code-douanes-2015-code-des-douanes": {"nom": "Code des douanes", "type": "CODE", "domaine": "Fiscalité"},
    "code-pastoral-2024": {"nom": "Code pastoral", "type": "CODE", "domaine": "Environnement"},
    "code-l-2015-020-an-code-de-la-construction-et-de-lhabitation": {"nom": "Code de la construction et de l'habitation", "type": "CODE", "domaine": "Droit foncier"},
    "code-investissements-2015": {"nom": "Code des investissements", "type": "CODE", "domaine": "Economie"},
    "code-peche-continentale-2015": {"nom": "Code de la pêche continentale", "type": "CODE", "domaine": "Environnement"},
    "code-l-2018-048-an-code-de-laviation-civile": {"nom": "Code de l'aviation civile", "type": "CODE", "domaine": "Transport et commerce"},
    "code-l-2015-028-an-code-de-l-aquaculture": {"nom": "Code de l'aquaculture", "type": "CODE", "domaine": "Environnement"},
    "code-forestier": {"nom": "Code forestier", "type": "CODE", "domaine": "Environnement"},
    "code-eau": {"nom": "Code de l'eau", "type": "CODE", "domaine": "Environnement"},
    "code-sante-publique": {"nom": "Code de la santé publique", "type": "CODE", "domaine": "Santé publique"},
    "code-de-la-mutualite-1994": {"nom": "Code de la mutualité", "type": "CODE", "domaine": "Sécurité sociale"},
    "code-l-2025-019-cnt-portant-code-de-la-peche-maritime-le-conseil-national-de-la-transition": {"nom": "Code de la pêche maritime", "type": "LOI", "domaine": "Environnement"},
    "code-l-2017-040-an-code-des-collectivites-locales": {"nom": "Code des collectivités locales", "type": "CODE", "domaine": "Administration"},
    # Droit OHADA (applicable en Guinée)
    "acte-uniforme-societes-commerciales-auscgie": {"nom": "Acte uniforme OHADA relatif au droit des sociétés commerciales et du GIE (AUSCGIE)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-droit-commercial-general-audcg": {"nom": "Acte uniforme OHADA portant sur le droit commercial général (AUDCG)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-procedures-recouvrement-aupsrve": {"nom": "Acte uniforme OHADA portant organisation des procédures simplifiées de recouvrement et des voies d'exécution (AUPSRVE)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-procedures-collectives-aupcap": {"nom": "Acte uniforme OHADA portant organisation des procédures collectives d'apurement du passif (AUPCAP)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-suretes-aus": {"nom": "Acte uniforme OHADA portant organisation des sûretés (AUS)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-societes-cooperatives-auscoop": {"nom": "Acte uniforme OHADA relatif au droit des sociétés coopératives (AUSCOOP)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-arbitrage-aua": {"nom": "Acte uniforme OHADA relatif au droit de l'arbitrage (AUA)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-mediation-aum": {"nom": "Acte uniforme OHADA relatif à la médiation (AUM)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-transport-marchandises-auctmr": {"nom": "Acte uniforme OHADA relatif aux contrats de transport de marchandises par route (AUCTMR)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-comptabilite-syscohada-audcif": {"nom": "Acte uniforme OHADA relatif au droit comptable et à l'information financière (AUDCIF)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    "acte-uniforme-comptabilite-asbl-sycebnl": {"nom": "Acte uniforme OHADA — Système comptable des entités à but non lucratif (SYCEBNL)", "type": "ACTE UNIFORME OHADA", "domaine": "Economie"},
    # Versions que le site présente lui-même comme historiques
    "acte-uniforme-procedures-recouvrement-aupsrve-1998": {"nom": "AUPSRVE — version originale de 1998", "type": "ACTE UNIFORME OHADA", "domaine": "Economie",
                                                           "statut": "historique", "statut_source": "Présenté par la source comme « version originale (historique) » ; remplacé par l'AUPSRVE révisé de 2023."},
    "acte-uniforme-comptabilite-audc-2000": {"nom": "Acte uniforme relatif au droit comptable — version de 2000", "type": "ACTE UNIFORME OHADA", "domaine": "Economie",
                                            "statut": "historique", "statut_source": "Présenté par la source comme « version historique » ; remplacé par l'AUDCIF de 2017."},
}

# Noms affichés de nos textes (les PDF d'origine donnaient des titres en capitales
# sans accents : « CODE PENAL DE 2016 »). Le numéro et la date restent dans leurs champs.
DISPLAY_NAMES = {
    "doc_001": "Code des activités économiques",
    "doc_002": "Code de conduite de l'agent public",
    "doc_003": "Code de la protection et de la mise en valeur de l'environnement (1987)",
    "doc_004": "Loi portant protection de la faune sauvage et réglementation de la chasse",
    "doc_005": "Code de l'enfant",
    "doc_006": "Code foncier et domanial",
    "doc_007": "Code minier",
    "doc_008": "Code pénal",
    "doc_009": "Code du travail (version adoptée)",
    "doc_011": "Constitution de la République de Guinée",
    "doc_012": "Code électoral (2017)",
    "doc_013": "Décret sur la gouvernance financière des sociétés et établissements publics",
    "doc_014": "Charte de la Transition",
    "doc_015": "Code de sécurité sociale (1994) — fichier en doublon",
    "doc_016": "Code pétrolier",
    "doc_017": "Décret sur l'obligation d'assurance des biens et marchandises à l'importation",
    "doc_018": "Instruction sur le régime fiscal des marchés publics",
    "doc_019": "Code de conduite des forces de défense",
    "doc_020": "Code de procédure pénale",
    "doc_021": "Décret sur l'accès à l'information publique",
    "doc_022": "Loi sur la passation, le contrôle et la régulation des marchés publics et des délégations de service public",
    "doc_023": "Code du travail",
    "doc_024": "Loi sur le maintien de l'ordre public",
    "doc_025": "Loi portant organisation judiciaire",
    "doc_026": "Loi portant contenu local",
    "doc_027": "Loi portant statut général des autorités administratives indépendantes",
    "doc_028": "Loi sur l'identification des personnes physiques",
    "doc_029": "Loi sur la cybersécurité et la protection des données à caractère personnel",
    "doc_030": "Loi portant réglementation bancaire",
    "doc_031": "Code maritime",
    "doc_032": "Code civil",
    "doc_033": "Projet de Code général des impôts",
}

# Textes nationaux dont une partie est régie depuis 2000 par le droit OHADA (citation exacte du Traité)
PRIORITY_NOTES = {
    "doc_001": ("Code antérieur à l'adhésion de la Guinée à l'OHADA. Pour les sociétés commerciales, le droit "
                "commercial général, les sûretés, le recouvrement et les procédures collectives, les Actes uniformes "
                "s'appliquent en priorité : ils « sont directement applicables et obligatoires dans les Etats Parties, "
                "nonobstant toute disposition contraire de droit interne, antérieure ou postérieure » "
                "(article 10 du Traité OHADA de Port-Louis)."),
}

# Statut de nos propres documents, établi par une disposition des textes collectés
OUR_STATUS: dict[str, dict] = {
    "doc_003": {"statut": "abroge", "remplace_par_slug": "code-environnement",
                "statut_source": "Code de l'environnement (L/2019/0034/AN), article 211 : « Le présent Code abroge toutes dispositions antérieures contraires, notamment celles de l'Ordonnance N° 045/PRG/87 du 28 mai 1987 portant Code de de l'environnement. »"},
    "doc_012": {"statut": "abroge", "remplace_par_slug": "code-electoral-2025",
                "statut_source": "Code électoral (L/2025/026/CNT), article 342 : « Les dispositions de la Loi organique L/039/2017/AN portant Code électoral révisé de la République de Guinée et toutes autres dispositions légales ou règlementaires contraires au présent Code sont abrogées. »"},
    "doc_033": {"statut": "projet", "remplace_par_slug": "code-general-des-impots",
                "statut_source": "Notre document est le projet de Code général des impôts ; le texte adopté (L/2021/032/AN du 4 juillet 2021) est désormais au corpus."},
    "doc_015": {"statut": "doublon", "remplace_par_slug": "code-securite-sociale",
                "statut_source": "Le fichier annoncé comme partie réglementaire contient en réalité la loi L/94/006/CTRN (mêmes articles que doc_034, en OCR) ; la partie législative et la partie réglementaire collectées sont au corpus."},
}

_DESC_RE = re.compile(r"(?:Code|Acte Uniforme OHADA)\s+(?:n°\s*(?P<num>\S+)\s+)?du\s+(?P<date>\d{1,2}(?:er)?\s+\S+\s+\d{4})")


# ── Outils ───────────────────────────────────────────────────────────────────

def _num_key(article_ref: str) -> str | None:
    """« Article 172.23 », « Art. 1er », « Article 22 bis » → « 172-23 », « 1 », « 22-bis »."""
    ref = (article_ref or "").strip()
    if re.search(r"\b(?:premier|1er)\b", ref, re.I) and not re.search(r"\d{2,}", ref):
        return "1"
    m = re.search(r"(\d+(?:[.\-]\d+)*)\s*(bis|ter|quater|quinquies)?\b", ref, re.I)
    if not m:
        return None
    base = m.group(1).replace(".", "-")
    return base + (f"-{m.group(2).lower()}" if m.group(2) else "")


def _sim(a: str, b: str, limit: int = 2000) -> float:
    return difflib.SequenceMatcher(None, dg.norm(a)[:limit], dg.norm(b)[:limit]).ratio()


def _load_ids() -> dict:
    if IDS_FILE.is_file():
        return json.loads(IDS_FILE.read_text(encoding="utf-8"))
    return {}


def _next_doc_id(used: set[str]) -> str:
    # doc_001…doc_999 : codes, lois et guides ; doc_1001+ : textes officiels (import_textes)
    n = max(int(d.split("_")[1]) for d in used if re.match(r"doc_\d+$", d) and int(d.split("_")[1]) < 1000) + 1
    return f"doc_{n:03d}"


def _article_record(doc_id: str, art: dict) -> dict:
    rec = {
        "doc_id": doc_id,
        "article_ref": art["article_ref"],
        "livre": art.get("livre", ""),
        "division": art.get("division", ""),
        "titre": art.get("titre", ""),
        "chapitre": art.get("chapitre", ""),
        "section": art.get("section", ""),
        "sous_section": art.get("sous_section", ""),
        "paragraphe": art.get("paragraphe", ""),
        "texte": art["texte"],
        "source": "droitguineen",
        "source_url": art["source_url"],
    }
    if _truncated(art["texte"]):
        rec["note"] = INCOMPLETE_NOTE
    elif art.get("note_complement"):
        rec["note"] = art["note_complement"]
    return rec


INCOMPLETE_NOTE = ("Texte incomplet à la source : la phrase s'interrompt (renvoi ou liste non repris). "
                   "Vérifier au Journal officiel avant de s'y fier.")
# Fin de texte qui trahit une coupure : « … dans les conditions de l'. », « … prévues à l'article », « … suivantes : »
_TRUNC_RE = re.compile(
    r"(?:\b(?:l[’']|d[’']|de|du|des|à|au|aux|la|le|les|par|en|et|ou|sur|dans|selon|un|une|son|sa|ses)\s*[.;,]?"
    r"|[’']\s*\.|:)\s*$", re.I)


def _truncated(texte: str) -> bool:
    t = (texte or "").strip()
    if not t or re.search(r"\bFait\s+à\.?$", t):   # formule de signature, pas une coupure
        return False
    return bool(_TRUNC_RE.search(t))


# Bruit de mise en page dans NOS extractions PDF : en-tête de page tronqué
# (« L DE LA REPUBLIQUE DE GUINEE 09 ») et intitulé de la division suivante
# collé à la fin de l'article (« … SECTION IV: DU CERTIFICAT DE NATIONALITE »).
_OUR_PAGE_NOISE = re.compile(r"\s*\b(?:JOURNA)?L\s+(?:OFFICIEL\s+)?DE\s+LA\s+REPUBLIQUE\s+DE\s+GUINEE\s+\d{1,3}\b")
_TRAILING_HEADING = re.compile(
    r"\s+(?:LIVRE|TITRE|CHAPITRE|SOUS-SECTION|SECTION|PARAGRAPHE)\s+(?:[IVXLC]+|\d+|PREMIER|UNIQUE)\b[^a-z]{0,160}$")


def _strip_layout_noise(text: str) -> str:
    t = _OUR_PAGE_NOISE.sub(" ", text or "")
    t = _TRAILING_HEADING.sub("", t)
    return re.sub(r"\s+", " ", t).strip()


_MERGED_RE = re.compile(r"(?:^|\s)Article\s*\d+[\w\-]*\s*:")


def _looks_merged(ours: str, theirs: str) -> bool:
    """Notre article a-t-il absorbé le suivant (« … Article 250: … ») ou commence-t-il par « : » ?"""
    if ours.lstrip().startswith(":"):
        return True
    return bool(_MERGED_RE.search(ours)) and not _MERGED_RE.search(theirs)


# ── 1. Codes ─────────────────────────────────────────────────────────────────

_RANGE_RE = re.compile(r"^(?P<sep>à|et)\s+(?P<end>\d+[\w\-]*)\.?\s*[-–‐.]*\s*(?P<rest>.*)$", re.S)


def complete_from_page(slug: str, arts: list[dict], page: dict, report: dict) -> list[dict]:
    """Complète les articles d'un texte avec sa page « texte intégral » (seconde source).

    - article absent de la collecte article par article → ajouté s'il a un vrai contenu ;
    - plage « Art. 8 à 12. – Abrogés. » → une entrée « Articles 8 à 12 » (l'information
      « abrogé » est précieuse : l'assistant peut dire qu'un article n'existe plus) ;
    - article tronqué à la source → remplacé si la page donne une version complète
      qui commence pareil et n'est pas tronquée.
    """
    body = page.get("_body") or ""
    if not body:
        return arts
    url = f"{dg.SITE}/lois/{slug}"
    by_num = {a["num"]: a for a in arts}
    added = repaired = 0
    extra = []
    for num, texte in dg.split_full_page(body):
        ref = f"Article {num.replace('-', ' ')}"
        rm = _RANGE_RE.match(texte)
        if rm:
            rest = rm.group("rest").strip()
            first = re.split(r"(?<=[.])\s", rest, maxsplit=1)[0].strip()
            if re.match(r"(?i)^(abrog|r[ée]serv)", first):
                ref = f"Articles {num} {rm.group('sep')} {rm.group('end')}"
                texte = first
        if num in by_num:
            mine = by_num[num]
            if _truncated(mine["texte"]) and not _truncated(texte) and len(texte) > len(mine["texte"]) \
                    and _sim(mine["texte"][:200], texte[:200]) >= 0.9:
                mine["texte"] = texte
                mine["source_url"] = url
                mine["note_complement"] = "Texte complété d'après la page « texte intégral » de la source."
                repaired += 1
            continue
        if len(texte) < 40 and not re.match(r"(?i)^(abrog|r[ée]serv)", texte):
            continue        # simple intitulé (« Définition ») sans le corps de l'article
        extra.append({"slug": slug, "num": num, "article_ref": ref, "texte": texte, "source_url": url,
                      "retrieved_at": page.get("retrieved_at", ""), "texte_ref": "", "hierarchy": "",
                      "doc_name": "", "sha256": ""})
        added += 1
    if added or repaired:
        report["complements_page"].append({"slug": slug, "ajoutes": added, "completes": repaired})
    merged = arts + extra
    merged.sort(key=lambda a: dg.natural_key(a["num"]))
    return merged


# Régimes des formes de sociétés dans l'AUSCGIE, repérés par leur article de définition
# (« La société anonyme est une société dans laquelle… », art. 385). Un article appartient au
# régime de la dernière définition qui le précède. Le dernier bloc (GIE, art. 869) n'a pas de
# borne de fin dans le texte : il n'est pas étiqueté plutôt que de deviner.
_FORM_DEFINITION = re.compile(
    r"^(?:La |Le )?(?P<forme>société en nom collectif|société en commandite simple|société à responsabilité limitée|"
    r"société anonyme|société par actions simplifiée|société en participation|groupement d'intérêt économique)"
    r"\s+(?:est celle|est celui|est une société)", re.I)


def label_company_regimes(records: list[dict]) -> int:
    anchors = []
    for i, a in enumerate(records):
        m = _FORM_DEFINITION.match((a.get("texte") or "").strip())
        if m and m.group("forme").lower() not in {f for _, f in anchors}:
            anchors.append((i, m.group("forme").lower()))
    labelled = 0
    for k, (start, forme) in enumerate(anchors[:-1]):       # le dernier régime n'a pas de fin connue
        end = anchors[k + 1][0]
        first, last = records[start]["article_ref"], records[end - 1]["article_ref"]
        label = f"{forme[0].upper()}{forme[1:]} ({first.lower()} à {last.replace('Article ', '')})"
        for a in records[start:end]:
            a["division"] = label
            labelled += 1
    return labelled


def build_codes(codes: dict[str, list[dict]], pages: dict, metadata: list[dict], ids: dict, report: dict):
    meta_by_id = {m["doc_id"]: m for m in metadata}
    used = set(meta_by_id) | set(ids.values())
    outputs: dict[str, list[dict]] = {}

    for slug, conf in CODES.items():
        arts = codes.get(slug)
        if not arts:
            report["manquants"].append(slug)
            continue
        page = pages.get(slug) or {}
        arts = complete_from_page(slug, arts, page, report)
        dm = _DESC_RE.search(page.get("description", "") or "")
        numero = (dm.group("num") if dm and dm.group("num") else "") or arts[0].get("texte_ref", "")
        if numero in ("Code",):
            numero = ""
        date_iso = dg.parse_fr_date(dm.group("date")) if dm else ""
        url = f"{dg.SITE}/lois/{slug}"

        if conf.get("mode") == "fusion":
            doc_id = conf["doc"]
            outputs[doc_id] = _merge(doc_id, arts, report)
            m = meta_by_id[doc_id]
            m.setdefault("statut", "en_vigueur")
            m["url_droitguineen"] = url
            if numero and not m.get("numero"):
                m["numero"] = numero
            continue

        if conf.get("mode") == "remplacement":
            doc_id = conf["doc"]
            outputs[doc_id] = [_article_record(doc_id, a) for a in arts]
            m = meta_by_id[doc_id]
            m.update({
                "nom": conf.get("nom", m["nom"]),
                "numero": numero or m.get("numero", ""),
                "source_officielle": SOURCE_LABEL,
                "url_source": url,
                "url_droitguineen": url,
                "statut": "en_vigueur",
                "verification_status": "source_web_verifiee",
                "remplacement": f"Texte précédent (OCR) remplacé par la version collectée le {arts[0]['retrieved_at'][:10]}.",
            })
            report["remplaces"].append({"doc_id": doc_id, "slug": slug, "articles": len(arts)})
            continue

        doc_id = ids.get(slug)
        if not doc_id:
            doc_id = _next_doc_id(used)
            ids[slug] = doc_id
        used.add(doc_id)
        outputs[doc_id] = [_article_record(doc_id, a) for a in arts]
        if slug == "acte-uniforme-societes-commerciales-auscgie":
            report["regimes_auscgie"] = label_company_regimes(outputs[doc_id])
        ohada = conf["type"] == "ACTE UNIFORME OHADA"
        entry = {
            "doc_id": doc_id,
            "nom": conf["nom"],
            "type": conf["type"],
            "numero": "" if ohada else numero,
            "date_adoption": date_iso[:4],
            "date_promulgation": date_iso,
            "nombre_pages": 0,
            "source_pdf": "",
            "source_officielle": OHADA_LABEL if ohada else SOURCE_LABEL,
            "url_source": url,
            "url_droitguineen": url,
            "domaine": conf["domaine"],
            "statut": conf.get("statut", "en_vigueur"),
            "verification_status": "source_web",
            "collecte_le": max(a["retrieved_at"] for a in arts)[:10],
        }
        if conf.get("statut_source"):
            entry["statut_source"] = conf["statut_source"]
        if doc_id in meta_by_id:
            meta_by_id[doc_id].update(entry)
        else:
            metadata.append(entry)
            meta_by_id[doc_id] = entry
        report["nouveaux"].append({"doc_id": doc_id, "slug": slug, "nom": conf["nom"], "articles": len(arts),
                                   "statut": entry["statut"]})

    # Statut de nos documents remplacés ou abrogés
    for doc_id, st in OUR_STATUS.items():
        m = meta_by_id[doc_id]
        m["statut"] = st["statut"]
        m["statut_source"] = st["statut_source"]
        target = ids.get(st["remplace_par_slug"]) or CODES.get(st["remplace_par_slug"], {}).get("doc")
        if target:
            m["remplace_par"] = target
        report["statuts"].append({"doc_id": doc_id, "nom": m["nom"].strip(), **{k: v for k, v in st.items() if k != "remplace_par_slug"},
                                  "remplace_par": target})
    for m in metadata:
        m.setdefault("statut", "en_vigueur")
        if m["doc_id"] in PRIORITY_NOTES:
            m["note"] = PRIORITY_NOTES[m["doc_id"]]
        if m["doc_id"] in DISPLAY_NAMES:
            if m["nom"].strip() != DISPLAY_NAMES[m["doc_id"]]:
                m.setdefault("nom_original", m["nom"].strip())
            m["nom"] = DISPLAY_NAMES[m["doc_id"]]
    return outputs


_WORD_RE = re.compile(r"[A-Za-zÀ-ÿ]{3,}")
_VOCAB: Counter = Counter()


def _build_vocab(codes: dict[str, list[dict]]) -> None:
    """Fréquence des mots sur tout le corpus : un mot vu une ou deux fois est suspect."""
    _VOCAB.clear()
    for arts in codes.values():
        for a in arts:
            _VOCAB.update(w.lower() for w in _WORD_RE.findall(a["texte"]))
    for path in sorted(ARTICLES_DIR.glob("doc_*.json")):
        try:
            for a in json.loads(_baseline(f"articles/{path.name}")):
                _VOCAB.update(w.lower() for w in _WORD_RE.findall(a.get("texte", "")))
        except Exception:
            continue


def _odd_words(text: str) -> int:
    return sum(1 for w in _WORD_RE.findall(text or "")
               if _VOCAB[w.lower()] <= 2 or (re.search(r"[a-z][A-Z]|[A-Z]{2,}[a-z]", w) and not w.isupper()))


def _baseline(rel_path: str) -> str:
    """Version validée (dernier commit) d'un fichier du corpus : rend le script rejouable."""
    import subprocess
    try:
        return subprocess.run(["git", "show", f"{BASELINE_REF}:model/corpus/{rel_path}"], cwd=MODEL_DIR.parent,
                              capture_output=True, text=True, check=True).stdout
    except Exception:
        return (CORPUS_DIR / rel_path).read_text(encoding="utf-8")


def _merge(doc_id: str, theirs: list[dict], report: dict) -> list[dict]:
    """Garde nos articles validés ; ajoute les manquants ; répare les fusionnés."""
    ours = json.loads(_baseline(f"articles/{doc_id}.json"))
    by_num: dict[str, int] = {}
    for i, a in enumerate(ours):
        k = _num_key(a.get("article_ref", ""))
        if k and k not in by_num:
            by_num[k] = i

    stats = Counter()
    divergences = []
    added = []
    for art in theirs:
        k = art["num"].lower()
        if k not in by_num:
            # « 30-iii » chez la source, paragraphe « III » de notre « Article 30 » : même texte,
            # numéroté autrement. On n'ajoute que ce qui n'existe pas déjà sous le même numéro de base.
            base = k.split("-")[0]
            same_base = [o for o in ours if (_num_key(o.get("article_ref", "")) or "").split("-")[0] == base]
            if any(_sim(o["texte"], art["texte"]) >= 0.85 for o in same_base):
                stats["deja_presents"] += 1
                continue
            added.append(_article_record(doc_id, art))
            stats["ajoutes"] += 1
            continue
        mine = ours[by_num[k]]
        theirs_ok = not _truncated(art["texte"])
        # Bruit de mise en page dans notre PDF (en-tête de page, intitulé suivant) :
        # on le retire de NOTRE texte, à condition que la version collectée
        # confirme que ces mots ne font pas partie de l'article.
        cleaned = _strip_layout_noise(mine["texte"])
        if theirs_ok and cleaned != re.sub(r"\s+", " ", mine["texte"]).strip() and \
                _sim(cleaned, art["texte"], 6000) >= 0.97:
            mine["texte_avant_reparation"] = mine["texte"]
            mine["texte"] = cleaned
            mine["source_url"] = art["source_url"]
            mine["note"] = "En-tête de page du Journal officiel retiré (confirmé par la version collectée)."
            stats["nettoyes"] += 1
            continue
        s = _sim(mine["texte"], art["texte"])
        if s >= 0.9:
            # Même article, mais notre OCR a pu couper ou déformer des mots
            # (« mor t », « te mps », « IDISSion ») : on prend la version qui
            # contient le moins de mots anormaux, sans jamais perdre de contenu.
            if theirs_ok and dg.norm(mine["texte"]) != dg.norm(art["texte"]) and \
                    len(art["texte"]) >= 0.9 * len(_strip_layout_noise(mine["texte"])) and \
                    _odd_words(art["texte"]) < _odd_words(mine["texte"]):
                mine["texte_avant_reparation"] = mine["texte"]
                mine["texte"] = art["texte"]
                mine["source"] = "droitguineen"
                mine["source_url"] = art["source_url"]
                mine["note"] = "Erreurs de reconnaissance (OCR) de notre PDF corrigées d'après la version collectée."
                stats["ocr_corriges"] += 1
                continue
            stats["identiques"] += 1
            mine.setdefault("source_url", art["source_url"])
            continue
        if not theirs_ok:
            stats["source_tronquee"] += 1   # on garde notre texte complet
            mine.setdefault("source_url", art["source_url"])
            continue
        if _looks_merged(mine["texte"], art["texte"]) and art["texte"] and \
                _sim(mine["texte"][: len(art["texte"]) + 40], art["texte"]) >= 0.8:
            mine["texte_avant_reparation"] = mine["texte"]
            mine["texte"] = art["texte"]
            mine["source"] = "droitguineen"
            mine["source_url"] = art["source_url"]
            mine["note"] = "Article séparé de l'article suivant d'après la version collectée."
            stats["repares"] += 1
            continue
        stats["divergents"] += 1
        mine.setdefault("source_url", art["source_url"])
        if s < 0.6:
            divergences.append({"article": art["article_ref"], "similarite": round(s, 2),
                                "notre_texte": mine["texte"][:400], "texte_collecte": art["texte"][:400],
                                "url": art["source_url"]})

    # Insertion des articles ajoutés à leur place (tri naturel, ordre d'origine conservé sinon)
    merged = ours + added
    keyed = []
    last = ((0, 0, ""),)
    for pos, a in enumerate(merged):
        k = _num_key(a.get("article_ref", ""))
        key = dg.natural_key(k) if k else last
        last = key
        keyed.append((key, 0 if pos < len(ours) else 1, pos, a))
    keyed.sort(key=lambda x: (x[0], x[1], x[2]))
    result = [a for *_, a in keyed]

    report["fusions"].append({"doc_id": doc_id, "avant": len(ours), "apres": len(result), **stats,
                              "divergences_fortes": len(divergences)})
    report["a_verifier"][doc_id] = divergences
    return result


# ── 2. Jurisprudence ─────────────────────────────────────────────────────────

_MATIERES = [
    ("Pénal", r"correctionnel|prévenu|infraction|ministère public|escroquerie|vol |abus de confiance|homicide|faux et usage|détention|chambre (?:criminelle|pénale)"),
    ("Administratif", r"excès de pouvoir|chambre administrative|recours en annulation|décret|arrêté ministériel|agent judiciaire de l'?[ée]tat"),
    ("Social", r"licenciement|employeur|salari[ée]|code du travail|contrat de travail|inspection du travail|droits sociaux"),
    ("Foncier", r"terrain|parcelle|titre foncier|domaine|immeuble|bail|expulsion|lotissement|propriété foncière"),
    ("Famille et successions", r"divorce|succession|héritier|mariage|filiation|pension alimentaire|garde de|époux|de cujus"),
    ("Commercial et OHADA", r"ohada|société|banque|commerc|saisie|recouvrement|injonction de payer|créance|acte uniforme|caution|chèque"),
]

_LAW_ALIASES = [
    ("code de procedure penale", "doc_020"), ("code penal", "doc_008"), ("code de penal", "doc_008"), ("code civil", "doc_032"),
    ("code du travail", "doc_023"), ("code de l enfant", "doc_005"), ("code foncier", "doc_006"),
    ("code minier", "doc_007"), ("constitution", "doc_011"), ("code maritime", "doc_031"),
    ("code des activites economiques", "doc_001"), ("code de procedure civile", "dg:code-d-98-100-prg-sgg-code-de-procedure-civile-economique-et-administrative"),
    ("code general des impots", "dg:code-general-des-impots"), ("code des douanes", "dg:code-douanes-2015-code-des-douanes"),
    ("code des assurances", "dg:code-l-2016-034-an-code-des-assurances"),
    ("acte uniforme relatif au droit des societes commerciales", "dg:acte-uniforme-societes-commerciales-auscgie"),
    ("auscgie", "dg:acte-uniforme-societes-commerciales-auscgie"),
    ("acte uniforme portant organisation des procedures simplifiees", "dg:acte-uniforme-procedures-recouvrement-aupsrve"),
    ("aupsrve", "dg:acte-uniforme-procedures-recouvrement-aupsrve"),
    ("acte uniforme portant sur le droit commercial general", "dg:acte-uniforme-droit-commercial-general-audcg"),
    ("audcg", "dg:acte-uniforme-droit-commercial-general-audcg"),
    ("acte uniforme portant organisation des suretes", "dg:acte-uniforme-suretes-aus"),
    ("acte uniforme relatif au droit de l arbitrage", "dg:acte-uniforme-arbitrage-aua"),
    ("acte uniforme portant organisation des procedures collectives", "dg:acte-uniforme-procedures-collectives-aupcap"),
    ("loi organique", None),
]

_CITE_RE = re.compile(
    r"\b[Aa]rt(?:icles?|\.)\s+(?P<nums>(?:\d+[\w\-]*(?:\s+(?:bis|ter|nouveau))?(?:\s*(?:,|et|à|al(?:in[ée]a)?\.?\s*\d+)\s*)*)+)"
    r"(?:\s*(?:al(?:in[ée]a)?\.?|paragraphe)\s*\d+)?\s*(?:,\s*)?(?:du|de\s+la|de\s+l[’'])\s+"
    r"(?P<law>(?:nouveau\s+|ancien\s+)?(?:Code|code|CODE|Acte\s+[Uu]niforme|ACTE\s+UNIFORME|Constitution|[Ll]oi|LOI|Traité|Règlement|AU[A-Z]{2,7})[^,;.()«»\n]{0,90})"
)
_JURIDICTIONS_TPI = re.compile(r"TRIBUNAL\s+DE\s+PREMI[ÈE]RE\s+INSTANCE\s+DE\s+([A-ZÉÈÀ’' \-]+?)(?:\\n|\n|\s{2,}|AFFAIRE)", re.I)


def _resolve_law(law: str, ids: dict) -> str | None:
    n = dg.norm(law)
    for alias, target in _LAW_ALIASES:
        if alias in n:
            if target and target.startswith("dg:"):
                return ids.get(target[3:]) or CODES.get(target[3:], {}).get("doc")
            return target
    return None


def _paragraphs(text: str) -> str:
    """Mise en forme sans changer un mot : sauts de ligne avant les articulations du raisonnement."""
    t = text.replace("\\n", "\n").replace("\r", "")
    t = re.sub(r"[ \t]+", " ", t)
    if t.count("\n") < 5:
        t = re.sub(
            r"\s+(?=(?:Attendu que|Attendu qu[’']|Mais attendu|Considérant que|Considérant qu[’']|"
            r"Sur le (?:premier|deuxième|second|troisième|quatrième|moyen|pourvoi)|SUR LE |PAR CES MOTIFS|"
            r"Vu (?:la|le|les|l[’'])|EN LA FORME|AU FOND|DÉCISION |ARRET N|ARRÊT N|LA COUR\b|Ainsi fait))",
            "\n\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _between(text: str, start: str, ends: list[str], max_len: int = 4000) -> str:
    i = text.find(start)
    if i < 0:
        return ""
    i += len(start)
    j = len(text)
    for e in ends:
        k = text.find(e, i)
        if k > 0:
            j = min(j, k)
    return text[i:j].strip()[:max_len]


def build_decisions(raw: list[dict], ids: dict, report: dict, key_index: dict | None = None) -> list[dict]:
    decisions = []
    seen = set()
    for item in raw:
        doc, meta = item["doc"], item["meta"]
        title = (doc.get("title") or "").replace(" | Droitguinéen", "").strip()
        flat = item["text"].replace("\\n", "\n")
        flat_one = re.sub(r"\s+", " ", flat)
        url = doc.get("canonical_url") or doc.get("source_url")
        key = hashlib.sha1(dg.norm(flat_one)[:3000].encode()).hexdigest()
        if key in seen:
            report["jurisprudence_doublons"].append(url)
            continue
        seen.add(key)

        nature = meta.get("nature") or ""
        juridiction = chambre = ""
        if "CCJA" in title or nature == "JURISPRUDENCE_CCJA":
            juridiction = "CCJA (OHADA)"
            chambre = (meta.get("signataires") or "").replace("CCJA — ", "")
        elif "Cour suprême" in title:
            juridiction = "Cour suprême"
            m = re.search(r"CHAMBRE\s+([A-ZÉÈÊ ,\-’']{6,80}?)(?=\s+(?:ARR[EÊ]T|AFFAIRE|N°|RG|Arr|Audience|COUR)|\s*$)", flat_one[:600])
            chambre = m.group(1).strip(" ,").capitalize() if m else (meta.get("signataires") or "").replace("Cour suprême — ", "").replace("Cour suprême", "")
        elif "Cour d'appel" in title:
            juridiction = "Cour d'appel de Conakry"
        else:
            m = _JURIDICTIONS_TPI.search(flat)
            juridiction = f"Tribunal de première instance de {m.group(1).strip().title()}" if m else "Tribunal de première instance"
            chambre = "Correctionnelle" if "correctionnel" in title.lower() else ""

        chambre = re.sub(r"\s+", " ", chambre or "").strip(" ,")
        chambre = {"Adminisrative": "Administrative", "Reunies": "Chambres réunies",
                   "Civile, penale, commerciale et sociale": "Chambre civile, pénale, commerciale et sociale"}.get(chambre, chambre)
        if chambre and juridiction == "Cour suprême" and not chambre.lower().startswith("chambre"):
            chambre = f"Chambre {chambre[0].lower()}{chambre[1:]}" if chambre != "Chambres réunies" else chambre
        date = (meta.get("dateSignature") or "")[:10]
        if not date:
            date = dg.parse_fr_date(title) or dg.parse_fr_date(re.search(r"AUDIENCE\s+du\s+[^\n]{6,30}", flat, re.I).group(0) if re.search(r"AUDIENCE\s+du\s+[^\n]{6,30}", flat, re.I) else "") or dg.parse_fr_date(flat_one[:1500])
        numero = meta.get("numero") or ""
        if not numero:
            m = re.search(r",\s*(\d+)\s*$", title) or re.search(r"\bRP\s*:?\s*(\d+(?:/\d{4})?)", flat)
            numero = m.group(1) if m else ""
        if juridiction.startswith("Tribunal") and numero and not numero.startswith("RP"):
            numero = f"RP {numero}"

        type_dec = "Jugement" if juridiction.startswith("Tribunal") else "Arrêt"

        # Parties (déjà pseudonymisées par la source)
        demandeur = defendeur = ""
        full = meta.get("titreComplet") or ""
        stop = r"\s+(?:Obj(?:et)?\b|OBJET\b|NATURE DU D[ÉE]LIT\b|INFRACTIONS?\b|Infractions?\b|D[ÉE]CISION\b|D[ée]cision\b|Partie civile\b)"
        if " — " in full and " c/ " in full:
            demandeur, defendeur = full.split(" — ", 1)[1].split(" c/ ", 1)
        else:
            for pat in (
                r"AFFAIRE\s*:?\s*(?P<a>.{3,260}?)\s+(?:C/|CONTRE\s*:?|Contre\s*:?)\s*(?P<b>.{3,260}?)" + stop,
                r"RG\s*N°\s*\S+(?:\s+du\s+\S+)?\s+(?P<a>.{3,260}?)\s+CONTRE\s*:?\s*(?P<b>.{3,260}?)" + stop,
                r"MINIST[ÈE]RE PUBLIC\s+(?:C/|Contre)\s*(?P<b>.{3,200}?)" + stop,
            ):
                m = re.search(pat, flat_one)
                if m:
                    demandeur = m.groupdict().get("a") or "Ministère public"
                    defendeur = m.group("b")
                    break
        if re.search(r"minist[èe]re public", demandeur, re.I):
            demandeur = "Ministère public"
        objet = ""
        for pat in (r"OBJET\s*:?\s*(.{8,320}?)(?=\s+(?:DECISION|DÉCISION|D[ée]cision)\b)",
                    r"Obj(?:et)?\s*:\s*(.{8,320}?)(?=\s+(?:DECISION|DÉCISION|D[ée]cision|AU NOM)\b)",
                    r"INFRACTIONS?\s*:?\s*(.{3,200}?)(?=\s+(?:Partie civile|PARTIE CIVILE|D[ÉE]CISION)\b)",
                    r"NATURE DU D[ÉE]LIT\s*:?\s*(.{3,200}?)(?=\s+(?:Partie civile|PARTIE CIVILE|D[ÉE]CISION)\b)",
                    r"Infractions\s+(.{4,200}?)\s+D[ÉE]CISION"):
            m = re.search(pat, flat_one)
            if m:
                objet = re.split(r"\s+(?:Partie civile|PARTIE CIVILE)\b", m.group(1))[0].strip(" ;,.:")
                break

        sommaire = _between(flat_one, "SOMMAIRE", ["ARTICLES CITÉS", "PARTIES", "DÉCISION"], 3000)
        k = flat_one.rfind("PAR CES MOTIFS")
        dispositif = ""
        if k >= 0:
            seg = flat_one[k + len("PAR CES MOTIFS"):]
            end = re.search(r"Ainsi fait|Et ont signé|ONT SIGNÉ|Le Président\s+Le Greffier", seg)
            dispositif = seg[: end.start() if end else 2500].strip(" :;,")[:2500]

        texte = _paragraphs(flat)

        cites, seen_c = [], set()
        for m in _CITE_RE.finditer(flat_one):
            law = re.sub(r"\s+", " ", m.group("law")).strip(" ,")
            law = re.split(r"\s*[:;]|\s+(?:qui|dispose|énonce|prévoit|stipule|selon|en ce|aux termes|que|lequel|laquelle|au sens|ainsi|s[’']|Considérant|Attendu|dont)\b", law)[0].strip(" ,")
            doc_id = _resolve_law(law, ids)
            if not doc_id and key_index:
                import import_textes as tx
                k = tx.numero_key(law)
                doc_id = key_index.get(tuple(k)) if k else None
            for num in re.findall(r"\d+[\w\-]*", m.group("nums")):
                if len(num) > 6:
                    continue
                key2 = (num, doc_id or dg.norm(law)[:40])
                if key2 in seen_c:
                    continue
                seen_c.add(key2)
                cites.append({"article": num, "texte": law[:90], "doc_id": doc_id})
        cites = cites[:30]

        matiere = ""
        for label, pat in _MATIERES:
            if re.search(pat, " ".join([objet, sommaire, title]), re.I):
                matiere = label
                break
        if not matiere:
            corps = re.sub(r"(?i)chambre[^.;]{0,80}?sociale", " ", flat_one[:10000])   # nom de chambre ≠ matière
            scores = {label: len(re.findall(pat, corps, re.I)) for label, pat in _MATIERES}
            best = max(scores, key=scores.get)
            matiere = best if scores[best] >= 2 else "Civil"

        cid = meta.get("cid") or ""
        base_id = re.sub(r"[^a-z0-9]+", "-", dg.norm(f"{juridiction} {date} {numero}"))[:70].strip("-")
        dec_id = base_id
        n = 2
        while any(d["id"] == dec_id for d in decisions):
            dec_id = f"{base_id}-{n}"
            n += 1

        decisions.append({
            "id": dec_id,
            "cid": cid,
            "titre": title,
            "type": type_dec,
            "juridiction": juridiction,
            "chambre": chambre.strip(),
            "date": date,
            "annee": int(date[:4]) if date[:4].isdigit() else None,
            "numero": numero,
            "matiere": matiere,
            "objet": objet,
            "parties": {"demandeur": demandeur.strip(" ,;"), "defendeur": defendeur.strip(" ,;")},
            "sommaire": sommaire,
            "dispositif": dispositif,
            "articles_cites": cites,
            "texte": texte,
            "longueur": len(texte),
            "source": "droitguineen.com",
            "source_url": url,
            "source_originale": meta.get("urlJO") or "",
            "collecte_le": (doc.get("retrieved_at") or "")[:10],
            "anonymisation": "Noms des parties pseudonymisés par la source.",
        })
    decisions.sort(key=lambda d: (d["date"] or "0000"), reverse=True)
    report["jurisprudence"] = {
        "decisions": len(decisions),
        "par_juridiction": dict(Counter(d["juridiction"] for d in decisions)),
        "par_matiere": dict(Counter(d["matiere"] for d in decisions)),
        "sans_date": [d["titre"] for d in decisions if not d["date"]],
        "avec_dispositif": sum(1 for d in decisions if d["dispositif"]),
        "articles_cites_resolus": sum(1 for d in decisions for c in d["articles_cites"] if c["doc_id"]),
        "articles_cites_total": sum(len(d["articles_cites"]) for d in decisions),
    }
    return decisions


# ── 3. Guide création d'entreprise ───────────────────────────────────────────

def build_company_guide(report: dict) -> dict | None:
    """Reprend la page « Créer une entreprise » : uniquement des passages cités tels quels."""
    items = dg.manifest_items("creation_entreprise")
    page = None
    for it in items:
        d = dg.load_json(dg.DATA_DIR / it["file"])
        if (d.get("canonical_url") or "").rstrip("/").endswith("/creation-entreprise"):
            page = d
    if not page:
        return None
    body = dg.strip_footer(page["content"])
    paras = [p.strip() for p in body.split("\n") if p.strip()]

    def para_after(prefix: str) -> str:
        for p in paras:
            if p.startswith(prefix):
                return p
        return ""

    faq = [p for p in paras if len(p) > 250]
    guide = {
        "id": "creer-une-entreprise",
        "titre": "Créer une entreprise en Guinée",
        "mise_a_jour_source": (re.search(r"Mis à jour le ([^·]+)", body) or [None, ""])[1].strip(),
        "sources": "Fiches du guichet unique de création d'entreprise (APIP / Guinea Development Board, 2026) et droit OHADA, d'après droitguineen.com",
        "source_url": page.get("canonical_url"),
        "collecte_le": (page.get("retrieved_at") or "")[:10],
        "formes": [
            {"forme": "Entreprise individuelle", "frais_guichet": "212 500 GNF", "precision": "Timbre fiscal compris",
             "notaire": "Non", "resume": "Simplicité de création, gestion libre. Une seule EI par personne (art. 49 AUDCG)."},
            {"forme": "SARL / SARLU", "frais_guichet": "530 000 GNF", "precision": "Statuts sous seing privé",
             "notaire": "Non exigé", "resume": "Forme la plus courante, souplesse de gestion, notaire non exigé"},
            {"forme": "SAS / SASU", "frais_guichet": "550 000 GNF", "precision": "Hors frais de notaire",
             "notaire": "Oui (acte de dépôt des statuts)", "resume": "Grande liberté statutaire ; dépôt des statuts chez le notaire"},
            {"forme": "Société anonyme (SA)", "frais_guichet": "550 000 GNF", "precision": "Hors frais de notaire",
             "notaire": "Oui", "resume": "Adaptée aux grands projets ; notaire et commissaire aux comptes obligatoires",
             "capital_minimum": "140 000 000 GNF (contre-valeur des 10 000 000 FCFA, art. 387 AUSCGIE)"},
            {"forme": "GIE", "frais_guichet": "450 000 GNF", "precision": "Hors frais de notaire",
             "notaire": "Oui", "resume": "Mise en commun de moyens entre entreprises ; dépôt des statuts chez le notaire"},
            {"forme": "SNC", "frais_guichet": "", "precision": "", "notaire": "",
             "resume": "Confiance entre associés, pas de capital minimum"},
        ],
        "delai": "72 heures à partir du dépôt d'un dossier complet",
        "etapes": [],
        "organismes": [],
        "textes": [
            {"nom": "AUSCGIE — sociétés commerciales et GIE", "slug": "acte-uniforme-societes-commerciales-auscgie"},
            {"nom": "AUDCG — droit commercial général (RCCM, entreprise individuelle)", "slug": "acte-uniforme-droit-commercial-general-audcg"},
            {"nom": "AUDCIF — droit comptable", "slug": "acte-uniforme-comptabilite-syscohada-audcif"},
            {"nom": "Code des investissements", "slug": "code-investissements-2015"},
        ],
        "questions_frequentes": faq,
    }
    step_titles = ["Choix de la forme juridique", "Statuts et procès-verbal constitutif", "Dépôt du capital en banque",
                   "Notaire (SA, SAS, GIE)", "Dépôt au guichet unique", "RCCM, NIF et publication", "Déclaration à la CNSS"]
    for i, t in enumerate(step_titles, 1):
        try:
            j = paras.index(t)
            guide["etapes"].append({"num": i, "titre": t, "description": paras[j + 1]})
        except ValueError:
            report["guide_alertes"].append(f"Étape introuvable dans la source : {t}")
    for org in ["Guichet unique APIP / GDB", "Banque", "Notaire", "Tribunal de Commerce", "CNSS"]:
        try:
            j = paras.index(org)
            guide["organismes"].append({"nom": org, "role": paras[j + 1]})
        except ValueError:
            pass
    # Contrôle : chaque montant repris doit figurer tel quel dans la page source
    for f in guide["formes"]:
        for v in (f["frais_guichet"], f.get("capital_minimum", "").split(" (")[0]):
            if v and v not in body:
                report["guide_alertes"].append(f"Montant absent de la source : {v}")
    return guide


def guide_articles(guide: dict, doc_id: str) -> list[dict]:
    """Le guide découpé en passages indexables (textes repris de la source)."""
    out = []

    def add(ref: str, texte: str):
        out.append({"doc_id": doc_id, "article_ref": ref, "livre": "", "titre": "", "chapitre": "", "section": "",
                    "sous_section": "", "paragraphe": "", "texte": texte, "source": "droitguineen",
                    "source_url": guide["source_url"]})

    for e in guide["etapes"]:
        add(f"Étape {e['num']} — {e['titre']}", e["description"])
    lignes = [f"{f['forme']} : {f['frais_guichet']} ({f['precision']})" for f in guide["formes"] if f["frais_guichet"]]
    add("Coût au guichet unique", "Montants payés au guichet unique de création d'entreprise (APIP / Guinea Development Board), d'après ses fiches d'information 2026 : "
        + " ; ".join(lignes) + f". Délai : {guide['delai']}.")
    for o in guide["organismes"]:
        add(f"Organisme — {o['nom']}", o["role"])
    for i, q in enumerate(guide["questions_frequentes"], 1):
        add(f"Question fréquente {i}", q)
    return out


# ── Rapport ──────────────────────────────────────────────────────────────────

def write_report(report: dict) -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    (REPORTS_DIR / "harmonisation_droitguineen.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    L = [f"# Harmonisation du corpus avec la collecte droitguineen.com", "",
         f"Généré le {report['genere_le']}. Aucun texte n'a été rédigé : les articles sont repris tels quels.", "",
         "## Codes déjà présents (même loi)", "",
         "| Document | Avant | Après | Identiques | OCR corrigés | Nettoyés | Ajoutés | Réparés | Source tronquée | Divergents | Dont forts (<60 %) |",
         "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for f in report["fusions"]:
        L.append(f"| {f['doc_id']} | {f['avant']} | {f['apres']} | {f.get('identiques', 0)} | {f.get('ocr_corriges', 0)} | {f.get('nettoyes', 0)} | {f.get('ajoutes', 0)} | "
                 f"{f.get('repares', 0)} | {f.get('source_tronquee', 0)} | {f.get('divergents', 0)} | {f['divergences_fortes']} |")
    L += ["", "« Nettoyé » : notre texte contenait un en-tête de page du JO ou l'intitulé de la division suivante ; on retire ce bruit de notre texte (la version collectée confirme qu'il ne fait pas partie de l'article).",
          "« Source tronquée » : la version collectée s'interrompt (lien perdu sur le site) ; on garde la nôtre, complète.",
          "« Réparé » : notre extraction PDF avait collé l'article suivant ; on reprend la version collectée.",
          "« Divergent » : nos deux versions diffèrent ; on garde la nôtre (validée) et l'écart est listé ci-dessous pour relecture.", "",
          "## Textes remplacés", ""]
    for r in report["remplaces"]:
        L.append(f"- {r['doc_id']} ← `{r['slug']}` ({r['articles']} articles)")
    if report.get("complements_page"):
        L += ["", "## Compléments tirés des pages « texte intégral »", "",
              "Articles absents de la collecte article par article (dont les plages « abrogés »), "
              "ou tronqués, repris de la page qui reproduit le texte complet.", "",
              "| Texte | Articles ajoutés | Articles complétés |", "|---|---:|---:|"]
        for c in report["complements_page"]:
            L.append(f"| {c['slug']} | {c['ajoutes']} | {c['completes']} |")
    L += ["", "## Statut de nos textes (non indexés pour les réponses)", ""]
    for s in report["statuts"]:
        L.append(f"- **{s['doc_id']} — {s['nom']}** : {s['statut']} → remplacé par {s['remplace_par']}. {s['statut_source']}")
    L += ["", "## Nouveaux textes", "", "| Document | Texte | Articles | Statut |", "|---|---|---:|---|"]
    for n in report["nouveaux"]:
        L.append(f"| {n['doc_id']} | {n['nom']} | {n['articles']} | {n['statut']} |")
    t = report.get("textes")
    if t:
        L += ["", "## Textes officiels (lois, décrets, arrêtés…)", "",
              f"- Répartition : {t['stats']}", f"- Familles : {t['familles']}",
              f"- Contrôles qualité (non indexés) : {t['qualite']}",
              f"- Journal officiel : {t['journal']['numeros']} numéros, {t['journal']['entrees']} textes annoncés, "
              f"{t['journal']['reliees']} reliés à un texte de la bibliothèque",
              f"- Relations repérées : {report.get('relations', {})}", "",
              "Seules les familles loi, constitution, traité, convention, réglementaire et organisation sont "
              "indexées pour les réponses ; les actes individuels, ratifications et promulgations restent consultables.", "",
              "### Textes écartés par les contrôles qualité", ""]
        for p in report.get("textes_problemes", [])[:120]:
            L.append(f"- {p['probleme']} — [{p['titre'][:90]}]({p['url']})")
    j = report.get("jurisprudence", {})
    L += ["", "## Jurisprudence", "", f"- Décisions : {j.get('decisions')}",
          f"- Par juridiction : {j.get('par_juridiction')}", f"- Par matière (classement automatique) : {j.get('par_matiere')}",
          f"- Avec dispositif repéré : {j.get('avec_dispositif')}",
          f"- Articles cités reliés au corpus : {j.get('articles_cites_resolus')} / {j.get('articles_cites_total')}",
          f"- Sans date : {j.get('sans_date')}", "",
          "## Collecte à compléter", ""]
    for f in report["echecs_collecte"]:
        L.append(f"- {f['url']} — {f['error']}")
    if report["guide_alertes"]:
        L += ["", "## Alertes guide création d'entreprise", ""] + [f"- {a}" for a in report["guide_alertes"]]
    L += ["", "## Divergences fortes à faire relire par un juriste", ""]
    for doc_id, divs in report["a_verifier"].items():
        if not divs:
            continue
        L.append(f"### {doc_id} ({len(divs)})")
        for d in divs[:60]:
            L.append(f"- **{d['article']}** ({int(d['similarite'] * 100)} %) — [source]({d['url']})")
            L.append(f"  - Notre texte : {d['notre_texte'][:220]}")
            L.append(f"  - Collecté : {d['texte_collecte'][:220]}")
        L.append("")
    (REPORTS_DIR / "harmonisation_droitguineen.md").write_text("\n".join(L) + "\n", encoding="utf-8")


# ── Main ─────────────────────────────────────────────────────────────────────

def main(report_only: bool) -> None:
    metadata = json.loads(_baseline("metadata.json"))
    ids = _load_ids()
    report = defaultdict(list)
    report["genere_le"] = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    report["a_verifier"] = {}
    report["echecs_collecte"] = dg.failed_pages()

    print("Lecture des articles collectés…", flush=True)
    codes = dg.load_code_articles()
    pages = dg.load_text_pages()
    print(f"  {sum(len(v) for v in codes.values())} articles, {len(codes)} textes", flush=True)

    _build_vocab(codes)
    outputs = build_codes(codes, pages, metadata, ids, report)

    print("Textes officiels et Journal officiel…", flush=True)
    import import_textes as tx
    journal = tx.build_textes(metadata, ids, outputs, report, _merge, _article_record)
    key_index = {}
    for m in metadata:
        k = tx.numero_key(m.get("numero", ""))
        if k and m.get("statut", "en_vigueur") == "en_vigueur":
            key_index.setdefault(tuple(k), m["doc_id"])

    print("Jurisprudence…", flush=True)
    decisions = build_decisions(dg.load_decisions_raw(), ids, report, key_index)

    print("Guide création d'entreprise…", flush=True)
    guide = build_company_guide(report)
    if guide:
        slug = "guide-creation-entreprise"
        doc_id = ids.get(slug)
        used = {m["doc_id"] for m in metadata} | set(ids.values())
        if not doc_id:
            doc_id = _next_doc_id(used)
            ids[slug] = doc_id
        outputs[doc_id] = guide_articles(guide, doc_id)
        entry = {
            "doc_id": doc_id, "nom": "Guide pratique — Créer une entreprise en Guinée (guichet unique APIP/GDB)",
            "type": "GUIDE PRATIQUE", "numero": "", "date_adoption": "2026", "date_promulgation": "",
            "nombre_pages": 0, "source_pdf": "", "source_officielle": guide["sources"],
            "url_source": guide["source_url"], "domaine": "Economie", "statut": "en_vigueur",
            "verification_status": "source_web", "collecte_le": guide["collecte_le"],
            "note": "Informations pratiques (coûts, délais, pièces), pas un texte de loi. Montants à vérifier auprès du guichet unique avant le dépôt.",
        }
        metadata = [m for m in metadata if m["doc_id"] != doc_id] + [entry]

    print("Relations entre textes…", flush=True)

    def _load_articles(doc_id: str) -> list[dict]:
        path = ARTICLES_DIR / f"{doc_id}.json"
        return json.loads(path.read_text(encoding="utf-8")) if path.is_file() else []
    relations = tx.build_relations(metadata, outputs, _load_articles)
    report["relations"] = {"textes_relies": len(relations),
                           "liens": sum(len(v["cite"]) for v in relations.values())}

    write_report(report)
    print(f"Rapport → {REPORTS_DIR / 'harmonisation_droitguineen.md'}")
    if report_only:
        print("--report-only : corpus inchangé.")
        return

    for doc_id, arts in outputs.items():
        (ARTICLES_DIR / f"{doc_id}.json").write_text(json.dumps(arts, ensure_ascii=False, indent=2), encoding="utf-8")
    metadata.sort(key=lambda m: m["doc_id"])
    METADATA_FILE.write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    JURIS_DIR.mkdir(parents=True, exist_ok=True)
    (JURIS_DIR / "decisions.json").write_text(json.dumps(decisions, ensure_ascii=False, indent=1), encoding="utf-8")
    if guide:
        GUIDES_DIR.mkdir(parents=True, exist_ok=True)
        (GUIDES_DIR / "creation_entreprise.json").write_text(json.dumps(guide, ensure_ascii=False, indent=2), encoding="utf-8")
    (CORPUS_DIR / "journal_officiel").mkdir(parents=True, exist_ok=True)
    (CORPUS_DIR / "journal_officiel" / "numeros.json").write_text(
        json.dumps(journal, ensure_ascii=False, indent=1), encoding="utf-8")
    (CORPUS_DIR / "relations.json").write_text(json.dumps(relations, ensure_ascii=False), encoding="utf-8")
    IDS_FILE.parent.mkdir(parents=True, exist_ok=True)
    IDS_FILE.write_text(json.dumps(ids, ensure_ascii=False, indent=2, sort_keys=True), encoding="utf-8")
    print(f"Corpus écrit : {len(outputs)} documents, {len(decisions)} décisions.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--report-only", action="store_true")
    main(ap.parse_args().report_only)

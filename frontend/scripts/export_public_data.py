"""Exporte les données publiques du corpus pour les pages pré-rendues (référencement).

Usage (depuis la racine du dépôt) :
    cd backend && env/bin/python ../frontend/scripts/export_public_data.py

Seules des informations publiques sortent d'ici : intitulés, numéros, dates, statuts,
nombre d'articles et sommaires (titres, chapitres…). Aucun texte d'article.
Les fichiers sont écrits dans frontend/src/app/pages/seo/data/ et versionnés :
la construction du site ne dépend pas de l'API.
À relancer après chaque mise à jour du corpus, puis construire le site.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
import unicodedata
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2] / "backend"
sys.path.insert(0, str(BACKEND))

from app.services import legal_library as lib  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "src" / "app" / "pages" / "seo" / "data"
TEXT_FAMILIES = {"code", "loi", "constitution", "traite", "convention"}


# Questions du guide « Créer une entreprise » : la source ne fournit que les réponses.
# Chaque question est rattachée au début exact de sa réponse ; une réponse absente est ignorée.
# Les paragraphes de présentation (non vérifiables ou promotionnels) ne sont pas repris.
FAQ_QUESTIONS = [
    ("La création d'une entreprise en Guinée se fait", "Comment créer une entreprise en Guinée ?"),
    ("D'après les fiches du guichet unique (2026), le montant", "Combien coûte la création d'une entreprise en Guinée ?"),
    ("Le guichet unique annonce un délai", "Combien de temps faut-il pour créer une entreprise en Guinée ?"),
    ("Pour une société, le guichet unique demande", "Quels documents fournir au guichet unique ?"),
    ("Le choix dépend du nombre d'associés", "Quelle forme juridique choisir pour son entreprise ?"),
    ("La SARL compte un ou plusieurs associés", "Quelle différence entre une SARL et une SA ?"),
    ("Le capital d'une SARL est librement fixé", "Quel capital minimum pour une SARL en Guinée ?"),
    ("Le coût de création d'une entreprise en Guinée payé", "Que couvrent les frais payés au guichet unique ?"),
    ("Les statuts sont l'acte fondateur", "Que doivent contenir les statuts d'une société ?"),
    ("Le droit applicable à la création d'une société", "Quel droit s'applique à la création d'une société en Guinée ?"),
    ("Oui. Vous pouvez désigner un mandataire", "Peut-on créer une entreprise en Guinée depuis l'étranger ?"),
    ("L'APIP (Agence de Promotion des Investissements Privés)", "Qu'est-ce que l'APIP et le guichet unique ?"),
    ("Le NIF (Numéro d'Identification Fiscale)", "Comment obtenir le NIF d'une nouvelle entreprise ?"),
    ("Le RCCM (Registre du Commerce et du Crédit Mobilier)", "Qu'est-ce que le RCCM ?"),
    ("Toute entreprise qui emploie des salariés", "Quand faut-il s'immatriculer à la CNSS ?"),
]


def tidy_heading(t: str) -> str:
    """Ponctuation seulement (« TITRE II - : CONCLUSION » → « TITRE II — CONCLUSION ») ; les mots ne changent pas."""
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"\s*-\s*:\s*", " — ", t)
    t = re.sub(r"\s+-\s+", " — ", t)
    return t.strip(" -—:")


def slugify(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\([^)]*\)", lambda m: m.group(0), s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return re.sub(r"-{2,}", "-", s)[:90].strip("-")


def write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def loaders(name: str, folder: str, keys: list[str]) -> str:
    lines = [f"  '{k}': () => import('./{folder}/{k}.json').then(m => m.default)," for k in keys]
    return (f"export const {name}: Record<string, () => Promise<any>> = {{\n" + "\n".join(lines) + "\n};\n")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    routes: list[dict] = []

    # ── Codes et lois en vigueur (consultables article par article dans l'application) ──
    docs = [d for d in lib.catalog()["documents"]
            if d["indexe"] and d["statut"] == "en_vigueur" and d["famille"] in TEXT_FAMILIES]
    seen: dict[str, int] = {}
    textes = []
    for d in sorted(docs, key=lambda d: (d["categorie"], -d["articles"])):
        base = slugify(d["nom"]) or d["doc_id"]
        slug = base if base not in seen else f"{base}-{d['annee'] or d['doc_id']}"
        seen[slug] = 1
        full = lib.document(d["doc_id"]) or {}
        sommaire = [{"n": e["niveau"], "t": tidy_heading(e["titre"]), "a": e.get("article_ref", "")}
                    for e in full.get("sommaire", []) if e.get("titre", "").strip()]
        item = {k: d[k] for k in ("doc_id", "nom", "type", "famille", "numero", "annee", "date", "categorie",
                                  "domaine", "articles", "source", "source_url", "decisions_citant")}
        item |= {"slug": slug, "ohada": d["categorie"] == "Droit OHADA", "sections": len(sommaire)}
        textes.append(item)
        rel = full.get("relations") or {}
        write(OUT / "texte" / f"{slug}.json", {
            **item,
            "note": d.get("note") or "",
            "sommaire": sommaire[:400],
            "cite": [{"nom": r.get("nom", ""), "numero": r.get("numero", "")} for r in (rel.get("cite") or [])[:20]],
            "cite_par": [{"nom": r.get("nom", ""), "numero": r.get("numero", "")} for r in (rel.get("cite_par") or [])[:20]],
        })
        routes.append({"path": f"/textes-de-loi-guinee/{slug}", "lastmod": None, "priority": 0.7, "changefreq": "monthly"})
    write(OUT / "textes.json", textes)
    (OUT / "texte-loaders.ts").write_text(
        "// Généré par scripts/export_public_data.py — ne pas modifier.\n"
        + loaders("TEXT_LOADERS", "texte", [t["slug"] for t in textes]), encoding="utf-8")

    # ── Droit OHADA ──
    hub = lib.ohada_hub()
    slug_by_id = {t["doc_id"]: t["slug"] for t in textes}
    write(OUT / "ohada.json", {
        "actes": [{"nom": a["nom"], "annee": a["annee"], "date": a["date"], "articles": a["articles"],
                   "slug": slug_by_id.get(a["doc_id"], "")} for a in hub["actes"]],
        "textes": [{"nom": a["nom"], "annee": a["annee"], "statut": a["statut"], "statut_label": a["statut_label"],
                    "slug": slug_by_id.get(a["doc_id"], "")} for a in hub["textes"]],
        "total_ccja": hub["total_ccja"],
        "total_articles": hub["total_articles"],
    })

    # ── Créer une entreprise (fiches du guichet unique) ──
    guide = lib.company_guide()
    if guide:
        guide["textes"] = [{**t, "slug": slug_by_id.get(t.get("doc_id", ""), "")} for t in guide.get("textes", [])]
        answers = guide.pop("questions_frequentes", [])
        faq = []
        for prefix, question in FAQ_QUESTIONS:
            a = next((x for x in answers if x.startswith(prefix)), None)
            if a:
                faq.append({"q": question, "a": a})
        guide["faq"] = faq
        write(OUT / "entreprise.json", guide)

    # ── Journal officiel : une page par année ──
    nums = sorted(lib.journal(), key=lambda n: n.get("date") or "", reverse=True)
    years: dict[str, list] = {}
    for n in nums:
        if n.get("date"):
            years.setdefault(n["date"][:4], []).append(n)
    def issue(n: dict) -> dict:
        return {"numero": n["numero"], "special": n.get("special", False), "date": n["date"], "titre": n["titre"],
                "theme": n.get("theme", ""),
                "entrees": [{"nature": e.get("nature") or "", "intitule": e["intitule"]} for e in n["entrees"]]}
    for y, items in years.items():
        write(OUT / "jo" / f"{y}.json", [issue(n) for n in items])
        routes.append({"path": f"/journal-officiel-guinee/{y}", "lastmod": items[0]["date"], "priority": 0.6,
                       "changefreq": "weekly" if y == max(years) else "yearly"})
    write(OUT / "jo-index.json", {
        "annees": [{"annee": y, "numeros": len(v), "textes": sum(len(n["entrees"]) for n in v)} for y, v in years.items()],
        "recents": [issue(n) for n in nums[:3]],
        "total_numeros": len(nums),
        "total_textes": sum(len(n["entrees"]) for n in nums),
    })
    (OUT / "jo-loaders.ts").write_text(
        "// Généré par scripts/export_public_data.py — ne pas modifier.\n"
        + loaders("JO_LOADERS", "jo", list(years)), encoding="utf-8")

    # ── Chiffres d'ensemble ──
    fig = lib.public_figures()
    write(OUT / "figures.json", {k: fig[k] for k in ("textes_en_vigueur", "articles", "textes_total", "codes_et_lois",
                                                      "actes_uniformes", "decisions", "numeros_jo")}
          | {"derniere_publication": nums[0]["date"] if nums else None,
             "exporte_le": date.today().isoformat()})
    write(OUT / "routes.json", routes)
    print(f"{len(textes)} textes · {len(years)} années de JO · {len(routes)} pages générées → {OUT}")


if __name__ == "__main__":
    main()

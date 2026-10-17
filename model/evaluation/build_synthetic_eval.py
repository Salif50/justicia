"""
Jeu d'évaluation de la recherche à grande échelle, construit à partir du corpus.

Pour un échantillon d'articles réels de l'index, un modèle rédige la question qu'un
citoyen guinéen poserait EN LANGAGE COURANT et à laquelle cet article répond.
La bonne réponse attendue est donc l'article source : rien n'est inventé, et
le jeu couvre tous les textes (et pas seulement les 6 questions de test_exactitude).

Usage (depuis backend/, pour disposer de la configuration et de la clé OpenAI) :
    PYTHONPATH=. ./env/bin/python ../model/evaluation/build_synthetic_eval.py --per-doc 8
Résultat : model/evaluation/synthetic_eval.jsonl
"""
import argparse
import json
import random
import re
import sys
from collections import defaultdict
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "04_pipeline"))

PROMPT = """On te donne un article de loi guinéen. Écris UNE question qu'un citoyen guinéen ordinaire
poserait à un assistant juridique, et à laquelle CET article répond directement.
Règles :
- français courant, comme à l'oral ou sur WhatsApp (pas de jargon inutile), 8 à 30 mots ;
- décris une situation ou une interrogation concrète ; n'écris NI le numéro d'article NI le nom du code ;
- ne recopie pas de phrase de l'article ;
- si l'article n'est pas exploitable (abrogation, renvoi pur, liste de définitions techniques, disposition
  transitoire, texte illisible), réponds {"skip": true}.
Réponds en JSON : {"question": "..."} ou {"skip": true}."""


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--per-doc", type=int, default=8, help="articles tirés par document")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--model", default="gpt-4o-mini")
    args = ap.parse_args()

    import warnings
    warnings.filterwarnings("ignore")
    from openai import OpenAI
    from retriever import HybridRetriever

    retriever = HybridRetriever(verbose=False)
    data = retriever.collection.get(include=["metadatas", "documents"])
    by_doc: dict[str, list] = defaultdict(list)
    for aid, meta, doc in zip(data["ids"], data["metadatas"], data["documents"]):
        texte = (meta.get("texte") or doc or "").strip()
        # Articles substantiels et lisibles uniquement
        if not 220 <= len(texte) <= 2200 or texte.count("|") > 4:
            continue
        by_doc[meta.get("nom") or meta.get("doc_id", "?")].append((aid, meta, texte))

    rng = random.Random(args.seed)
    client = OpenAI()
    out_path = HERE / "synthetic_eval.jsonl"
    kept = 0
    with out_path.open("w", encoding="utf-8") as out:
        for nom_doc, items in sorted(by_doc.items()):
            sample = rng.sample(items, min(args.per_doc, len(items)))
            for aid, meta, texte in sample:
                try:
                    resp = client.chat.completions.create(
                        model=args.model, temperature=0.7, response_format={"type": "json_object"},
                        messages=[{"role": "system", "content": PROMPT},
                                  {"role": "user", "content": f"Document : {nom_doc}\n\n{texte[:1800]}"}],
                    )
                    res = json.loads(resp.choices[0].message.content or "{}")
                except Exception as exc:  # noqa: BLE001
                    print("  erreur :", type(exc).__name__)
                    continue
                q = (res.get("question") or "").strip()
                if res.get("skip") or len(q) < 15 or re.search(r"\barticle\s+\d", q, re.I):
                    continue
                out.write(json.dumps({
                    "question": q, "id": aid, "nom_doc": nom_doc,
                    "article_ref": meta.get("article_ref", ""), "domaine": meta.get("domaine", ""),
                }, ensure_ascii=False) + "\n")
                kept += 1
            print(f"  {nom_doc[:60]:<60} → {kept} questions au total")
    print(f"\n{kept} questions écrites dans {out_path}")


if __name__ == "__main__":
    main()

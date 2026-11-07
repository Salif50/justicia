"""
Batterie de questions réelles, de bout en bout (triage, recherche, rédaction, garde-fous).

Chaque réponse attendue a été vérifiée dans le texte (champ « verifie »). Contrôles :
  source    l'un des articles attendus figure parmi les articles CITÉS de la réponse
  chiffre   le chiffre clé apparaît dans la réponse (18 %, 16 ans, dix jours…)
  retire    aucun texte abrogé / projet cité (« interdit_docs »)
  piege     article inexistant ou droit étranger : aucune source, rien d'inventé
  juris     une décision de justice est jointe quand c'est attendu

Usage (backend lancé sur :8000) :
    backend/env/bin/python model/evaluation/run_batterie.py --token <jeton> [--only id1,id2]
Le rapport est écrit dans model/evaluation/resultats_batterie.json.
"""

from __future__ import annotations

import argparse
import json
import re
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
API = "http://localhost:8000/api/conversation/send"
NO_SOURCE = re.compile(r"(aucun article|n[’']existe(?:nt)? pas dans|pas pu rattacher|ne permet pas de répondre|je préfère ne pas conclure|ne relève pas de ma compétence|"
                       r"droit (?:positif )?guinéen|hors de (?:mon|ce) (?:domaine|cadre)|pas en mesure|ne peux pas|domaine juridique)", re.I)


def ask(token: str, question: str) -> tuple[dict, float]:
    req = urllib.request.Request(
        API, data=json.dumps({"message": question, "agent_id": "jurisprudence"}).encode(),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"})
    t = time.time()
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.load(r), time.time() - t


def num_match(ref: str, expected: str) -> bool:
    if expected == "*":
        return True
    return re.search(rf"(?<![\d.\-]){re.escape(expected)}(?![\d])", ref or "") is not None


def check(case: dict, resp: dict) -> dict:
    content = resp.get("content", "")
    sources = resp.get("sources") or []
    cited = [s for s in sources if s.get("cite_no") and s.get("kind") != "decision"]
    cited_docs = {s.get("doc_id") for s in cited}
    out = {"id": case["id"], "question": case["q"], "verifie": case.get("verifie", ""), "controles": {},
           "cites": [f"{s.get('article_ref')} ({s.get('doc_id')})" for s in cited],
           "decisions": [s.get("article_ref") for s in sources if s.get("kind") == "decision" and s.get("cite_no")]}
    c = out["controles"]
    behaviour = case.get("comportement")
    if behaviour in ("pas_de_source", "refus"):
        # Refus ou absence de source : aucune citation et aucune réponse juridique rédigée
        # (la formulation du refus varie d'un appel à l'autre, elle n'est pas contrôlée mot à mot)
        no_answer = "ce que dit la loi" not in content.lower() and "### en bref" not in content.lower()
        c["piege"] = (not cited) and (no_answer or bool(NO_SOURCE.search(content))) and \
            not any(t.lower() in content.lower() for t in case.get("interdit_texte", []))
    if case.get("attendu"):
        c["source"] = any(s.get("doc_id") == d and num_match(s.get("article_ref", ""), n)
                          for s in cited for d, n in case["attendu"])
    for i, alternatives in enumerate(case.get("contient", [])):
        c[f"chiffre{i + 1}"] = any(a.lower() in content.lower() for a in alternatives)
    if case.get("interdit_docs"):
        c["retire"] = not (cited_docs & set(case["interdit_docs"]))
    if case.get("jurisprudence"):
        c["juris"] = any(s.get("kind") == "decision" for s in sources)
    out["ok"] = all(c.values())
    out["reponse"] = content
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--token", required=True)
    ap.add_argument("--only", default="")
    args = ap.parse_args()
    cases = json.loads((HERE / "batterie_reelle.json").read_text(encoding="utf-8"))
    if args.only:
        wanted = set(args.only.split(","))
        cases = [c for c in cases if c["id"] in wanted]
    results = []
    for case in cases:
        try:
            resp, secs = ask(args.token, case["q"])
            res = check(case, resp)
            res["secondes"] = round(secs, 1)
        except Exception as exc:  # noqa: BLE001
            res = {"id": case["id"], "question": case["q"], "ok": False, "erreur": str(exc), "controles": {}}
        results.append(res)
        flags = " ".join(f"{k}={'✓' if v else '✗'}" for k, v in res["controles"].items())
        print(f"{'✅' if res['ok'] else '❌'} {case['id']:26} {flags}  {res.get('secondes', '')}s", flush=True)
        if not res["ok"]:
            print(f"     cités : {res.get('cites')}  {res.get('erreur', '')}")
    ok = sum(r["ok"] for r in results)
    print(f"\nRésultat : {ok}/{len(results)}")
    (HERE / "resultats_batterie.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()

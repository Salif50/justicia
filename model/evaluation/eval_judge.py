"""
Effet du contrôle de pertinence (_judge_relevance) sur le jeu synthétique :
l'article attendu est-il conservé, et remonte-t-il dans le classement ?

Usage (depuis backend/) :
    PYTHONPATH=. ./env/bin/python ../model/evaluation/eval_judge.py --limit 100
"""
import argparse
import json
import os
import sys
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=100)
    args = ap.parse_args()
    from app.config import settings
    os.environ.setdefault("OPENAI_API_KEY", settings.OPENAI_API_KEY)
    sys.path.insert(0, str(HERE.parent / "04_pipeline"))
    import transformers
    transformers.logging.set_verbosity_error()
    import rag
    from rag import JusticIAPipeline

    rows = [json.loads(line) for line in (HERE / "synthetic_eval.jsonl").open()][: args.limit]
    hints = json.loads((HERE / ".hints_cache.json").read_text())
    pipe = JusticIAPipeline(provider="openai", verbose=False)
    cases = []
    for r in rows:
        res = pipe.retrieve_articles(r["question"], search_hint=hints.get(r["question"]) or None)
        cases.append((r, res))

    def judge(case):
        r, res = case
        q = f"{r['question']} (reformulation juridique : {res['search_hint']})" if res["search_hint"] else r["question"]
        return rag._judge_relevance(q, res["articles"], "openai")

    with ThreadPoolExecutor(8) as ex:
        judged = list(ex.map(judge, cases))

    before = after = dropped = present = 0
    rank_b, rank_a = [], []
    for (r, res), keep in zip(cases, judged):
        ids = [a["id"] for a in res["articles"]]
        if r["id"] not in ids:
            continue
        present += 1
        rb = ids.index(r["id"]) + 1
        rank_b.append(rb)
        if keep is None:
            rank_a.append(rb)
            continue
        kept_ids = [ids[i] for i in keep]
        if r["id"] in kept_ids:
            rank_a.append(kept_ids.index(r["id"]) + 1)
        else:
            dropped += 1
    top = lambda ranks, k: sum(1 for x in ranks if x <= k)
    print(f"{present} questions où la recherche a trouvé l'article attendu (sur {len(rows)})")
    print(f"  article ÉCARTÉ à tort par le contrôle : {dropped} ({dropped / max(present, 1):.1%})")
    for k in (1, 3):
        print(f"  dans le top {k} : avant contrôle {top(rank_b, k)} → après contrôle {top(rank_a, k)}")


if __name__ == "__main__":
    main()

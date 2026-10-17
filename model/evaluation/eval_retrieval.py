"""
Mesure de la recherche (RAG) sur le jeu synthetic_eval.jsonl — sans génération de réponse.

Pour chaque question : rang de l'article attendu dans les articles retenus par la
recherche de production (JusticIAPipeline.retrieve_articles), avec ou sans la
reformulation juridique produite par l'analyse de la question (assistant.triage).

Usage (depuis backend/) :
    PYTHONPATH=. ./env/bin/python ../model/evaluation/eval_retrieval.py            # brut + reformulé
    PYTHONPATH=. ./env/bin/python ../model/evaluation/eval_retrieval.py --modes raw
Les reformulations sont mises en cache (.hints_cache.json) pour comparer à coût nul.
"""
import argparse
import asyncio
import json
import os
import sys
import time
import warnings
from collections import Counter
from pathlib import Path

warnings.filterwarnings("ignore")
HERE = Path(__file__).resolve().parent
CACHE = HERE / ".hints_cache.json"


def load_hints(questions: list[str]) -> dict[str, str]:
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    missing = [q for q in questions if q not in cache]
    if missing:
        from app.services import assistant

        async def run():
            sem = asyncio.Semaphore(8)

            async def one(q):
                async with sem:
                    t = await assistant.triage(q, [])
                    cache[q] = t.search_query if t and t.search_query else ""
            await asyncio.gather(*(one(q) for q in missing))
        asyncio.run(run())
        CACHE.write_text(json.dumps(cache, ensure_ascii=False, indent=0))
    return cache


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--modes", default="raw,hint")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--show-misses", type=int, default=0)
    args = ap.parse_args()

    from app.config import settings
    os.environ.setdefault("OPENAI_API_KEY", settings.OPENAI_API_KEY)
    sys.path.insert(0, str(HERE.parent / "04_pipeline"))
    import transformers
    transformers.logging.set_verbosity_error()
    from rag import JusticIAPipeline

    rows = [json.loads(line) for line in (HERE / "synthetic_eval.jsonl").open()]
    if args.limit:
        rows = rows[: args.limit]
    pipe = JusticIAPipeline(provider="openai", verbose=False)
    modes = args.modes.split(",")
    hints = load_hints([r["question"] for r in rows]) if "hint" in modes else {}

    for mode in modes:
        ranks, misses, dom_miss = [], [], 0
        t0 = time.perf_counter()
        for r in rows:
            hint = hints.get(r["question"]) if mode == "hint" else None
            res = pipe.retrieve_articles(r["question"], search_hint=hint or None)
            ids = [a.get("id") for a in res["articles"]]
            rank = ids.index(r["id"]) + 1 if r["id"] in ids else None
            ranks.append(rank)
            if rank is None:
                if res["auto_detected"] and res["auto_detected"] != r["domaine"]:
                    dom_miss += 1
                misses.append((r, res["auto_detected"], [a.get("article_ref") for a in res["articles"][:3]]))
        n = len(ranks)
        at = lambda k: sum(1 for x in ranks if x and x <= k) / n
        mrr = sum(1 / x for x in ranks if x) / n
        print(f"\n[{mode}] {n} questions · {time.perf_counter() - t0:.0f}s")
        print(f"  recall@1 {at(1):.1%} · @3 {at(3):.1%} · @5 {at(5):.1%} · @10 {at(10):.1%} · MRR {mrr:.3f}")
        print(f"  échecs : {len(misses)} dont {dom_miss} avec un domaine détecté différent du domaine attendu")
        by_dom = Counter(m[0]["domaine"] for m in misses)
        print("  échecs par domaine :", ", ".join(f"{d} {c}" for d, c in by_dom.most_common(8)))
        for m, det, top in misses[: args.show_misses]:
            print(f"   ✗ [{m['domaine']} → détecté {det}] {m['question'][:90]}\n      attendu {m['article_ref']} ({m['nom_doc'][:40]}) · obtenu {top}")


if __name__ == "__main__":
    main()

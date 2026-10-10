"""
Script de test end-to-end du pipeline RAG JusticIA.
Lance depuis le répertoire model/ :
  python test_pipeline.py [--provider openai|anthropic|mistral|ollama]
"""

import argparse
import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")

sys.path.insert(0, str(Path(__file__).parent / "04_pipeline"))

# ── Questions de test couvrant les 6 agents ──────────────────────────────────
TEST_QUESTIONS = [
    {
        "q": "Quels sont les droits d'un salarié licencié sans motif valable en Guinée ?",
        "domain": "Droit du travail",
        "agent": "travail",
    },
    {
        "q": "Quelles sont les conditions pour obtenir un titre foncier en Guinée ?",
        "domain": "Droit foncier",
        "agent": "immobilier",
    },
    {
        "q": "Quelles sont les peines prévues pour le vol aggravé dans le code pénal guinéen ?",
        "domain": "Droit pénal",
        "agent": "penal",
    },
    {
        "q": "Comment se passe un divorce par consentement mutuel en Guinée ?",
        "domain": "Droit de la famille",
        "agent": "matrimonial",
    },
    {
        "q": "Quelles sont les obligations d'une SARL lors de sa création en Guinée ?",
        "domain": "Economie",
        "agent": "commercial",
    },
    {
        "q": "Quels sont les droits fondamentaux garantis par la Constitution guinéenne de 2025 ?",
        "domain": "Droit constitutionnel",
        "agent": "jurisprudence",
    },
]


def run_retriever_test() -> bool:
    """Teste uniquement le retriever (sans LLM) pour valider l'indexation."""
    print("\n" + "=" * 65)
    print("  TEST RETRIEVER (sans LLM)")
    print("=" * 65)

    try:
        from retriever import HybridRetriever
        r = HybridRetriever(verbose=True)
        count = r.article_count
        print(f"\n✅ Retriever chargé — {count} articles indexés")

        if count < 9000:
            print(f"⚠️  Seulement {count} articles — relancer ingest.py ?")
        elif count >= 12000:
            print("✅ Corpus complet (12,000+ articles)")
        else:
            print(f"ℹ️  {count} articles (ancien corpus, relancer ingest.py pour l'upgrade)")

        ok = 0
        for t in TEST_QUESTIONS[:3]:
            print(f"\nTest : {t['q'][:60]}...")
            start = time.time()
            arts  = r.retrieve(t["q"], domaine=t["domain"], top_k=5)
            elapsed = time.time() - start
            if arts:
                top = arts[0]
                print(f"  ✅ {len(arts)} résultats en {elapsed:.1f}s")
                print(f"     Top 1 : [{top['score']:.0%}] {top['nom_doc'][:40]} — {top['article_ref']}")
                ok += 1
            else:
                print(f"  ⚠️  Aucun résultat ({elapsed:.1f}s)")

        return ok >= 2

    except Exception as e:
        print(f"❌ Erreur retriever : {e}")
        import traceback
        traceback.print_exc()
        return False


def run_full_test(provider: str) -> None:
    """Teste le pipeline complet (retriever + LLM)."""
    print("\n" + "=" * 65)
    print(f"  TEST PIPELINE COMPLET — provider: {provider}")
    print("=" * 65)

    try:
        from rag import JusticIAPipeline
        pipeline = JusticIAPipeline(provider=provider, verbose=True)
    except Exception as e:
        print(f"❌ Erreur chargement pipeline : {e}")
        return

    for i, t in enumerate(TEST_QUESTIONS, 1):
        print(f"\n{'─' * 65}")
        print(f"Question {i}/{len(TEST_QUESTIONS)} [{t['agent']}]")
        print(f"  {t['q']}")
        print("─" * 65)

        start = time.time()
        try:
            reponse, sources = pipeline.answer(t["q"], domaine=t["domain"])
            elapsed = time.time() - start

            print(f"\n⏱  {elapsed:.1f}s | {len(sources)} source(s)")
            print(f"\nRÉPONSE :\n{reponse[:800]}{'...' if len(reponse) > 800 else ''}")

            if sources:
                print(f"\nSOURCES TOP 3 :")
                for s in sources[:3]:
                    print(f"  [{s['score']:.0%}] {s['nom_doc'][:40]} — {s['article_ref']}")

        except Exception as e:
            elapsed = time.time() - start
            print(f"❌ Erreur ({elapsed:.1f}s) : {e}")
            import traceback
            traceback.print_exc()

        if i < len(TEST_QUESTIONS):
            print("\n[Appuyez sur Entrée pour continuer, 'q' pour quitter]", end=" ")
            try:
                if input().lower() == "q":
                    break
            except (EOFError, KeyboardInterrupt):
                break


def check_indexation() -> None:
    """Affiche l'état actuel du vectorstore."""
    print("\n" + "=" * 65)
    print("  ÉTAT DU VECTORSTORE")
    print("=" * 65)

    import chromadb
    import pickle

    vs_dir = Path(__file__).parent / "03_vectorstore"
    manifest_path = vs_dir / "active_index.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.is_file() else {}
    bm25   = vs_dir / manifest.get("bm25_path", "bm25_index.pkl")
    collection_name = manifest.get("collection", "justicia_guinee")

    try:
        client     = chromadb.PersistentClient(path=str(vs_dir))
        collection = client.get_collection(collection_name)
        count      = collection.count()
        print(f"ChromaDB : {count} articles")
    except Exception as e:
        print(f"ChromaDB : ❌ {e}")

    try:
        with open(bm25, "rb") as f:
            data = pickle.load(f)
        print(f"BM25     : {len(data['ids'])} articles")

        domains: dict[str, int] = {}
        for uid, d in data["domains"].items():
            domains[d] = domains.get(d, 0) + 1
        print("\nRépartition par domaine :")
        for d, n in sorted(domains.items(), key=lambda x: -x[1]):
            print(f"  {d:<35} {n:>5} articles")
    except Exception as e:
        print(f"BM25     : ❌ {e}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test pipeline RAG JusticIA")
    parser.add_argument(
        "--provider", default="openai",
        choices=["openai", "anthropic", "mistral", "ollama"],
        help="Fournisseur LLM pour le test complet",
    )
    parser.add_argument(
        "--retriever-only", action="store_true",
        help="Tester uniquement le retriever (sans LLM)",
    )
    parser.add_argument(
        "--status", action="store_true",
        help="Afficher l'état du vectorstore et quitter",
    )
    args = parser.parse_args()

    from dotenv import load_dotenv
    load_dotenv(Path(__file__).parent / ".env")

    if args.status:
        check_indexation()
        sys.exit(0)

    check_indexation()

    if args.retriever_only:
        ok = run_retriever_test()
        sys.exit(0 if ok else 1)
    else:
        ok = run_retriever_test()
        if ok:
            run_full_test(args.provider)
        else:
            print("\n❌ Le retriever échoue — vérifiez l'ingestion avant de tester le LLM.")
            sys.exit(1)

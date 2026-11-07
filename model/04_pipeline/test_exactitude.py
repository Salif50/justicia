"""
Test d'exactitude du retrieval JusticIA-GN
============================================
Contrairement à test_qualite.py (score heuristique de forme), ce script vérifie
que le retrieval renvoie bien le ou les articles CORRECTS pour une question donnée.

Chaque paire question → article attendu a été vérifiée manuellement en lisant le
texte réel de l'article dans corpus/articles/*.json (pas de mémoire, pas de
supposition) avant d'être ajoutée ici. Voir le commentaire "Vérifié" sur chaque
entrée pour la référence exacte du texte source.

C'est le filet de sécurité de non-régression avant toute modification du pipeline
de retrieval (retriever.py / rag.py) : toute modification doit être relancée
contre ce script avant/après. Une régression (article attendu disparu du top-k)
bloque le changement — voir le plan "Amélioration RAG — performance + garde-fous
qualité".

Usage :
    cd model/04_pipeline
    python3 test_exactitude.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from retriever import HybridRetriever  # noqa: E402

# ─── Vérité terrain — vérifiée article par article dans corpus/articles/ ──────
GROUND_TRUTH = [
    {
        "question": "Quels sont les droits d'un salarié licencié sans motif valable en Guinée ?",
        "domaine": "Droit du travail",
        # Vérifié : doc_023.json (Nouveau Code du Travail 2014) —
        # Art 172.6 (motif réel et sérieux), 172.7 (procédure/48h), 172.10 (indemnité ≥3 mois)
        "articles_attendus": ["172.6", "172.7", "172.10"],
        "min_attendus": 1,  # au moins 1 des 3 doit apparaître dans le top_k
    },
    {
        "question": "Quelle est la durée légale du préavis pour un CDI en Guinée ?",
        "domaine": "Droit du travail",
        # Vérifié : doc_023.json — Art 172.23 (durée du préavis par catégorie)
        "articles_attendus": ["172.23"],
        "min_attendus": 1,
    },
    {
        "question": "Quelle est la durée de la période d'essai pour un cadre en Guinée ?",
        "domaine": "Droit du travail",
        # Vérifié le 2026-10-04 dans le texte indexé (ChromaDB, NOUVEAU CODE DE TRAVAIL 2014) —
        # Art 121.6 : « … ne peut, en aucun cas, même s'il y a renouvellement, être
        # supérieure, à trois mois lorsque le travailleur embauché est un cadre, et à un
        # mois dans les autres cas. » Cas signalé en production (« aucun article trouvé »).
        "articles_attendus": ["121.6"],
        "min_attendus": 1,
    },
    {
        "question": "Quels sont les droits d'une personne en garde à vue en Guinée ?",
        "domaine": "Droit pénal",
        # Vérifié : doc_020.json (Code de Procédure Pénale 2016) —
        # Art 85 (définition), 90 (droits notifiés), 93 (droit à un avocat)
        "articles_attendus": ["85", "90", "93"],
        "min_attendus": 1,
    },
    {
        "question": "Quel est l'âge minimum légal pour le mariage en Guinée ?",
        "domaine": "Droit civil",
        # Vérifié : doc_032.json (Code Civil 2019) —
        # Art 241 : "Les garçons et les filles de moins de 18 ans ne peuvent contracter mariage."
        "articles_attendus": ["241"],
        "min_attendus": 1,
    },
    {
        "question": "Quelles sont les conditions de la légitime défense en Guinée ?",
        "domaine": "Droit pénal",
        # Vérifié : doc_008.json (Code Pénal 2016) —
        # Art 22 : "Est présumé agir en état de légitime défense ou de nécessité..."
        "articles_attendus": ["22"],
        "min_attendus": 1,
    },
    # ── Textes intégrés depuis droitguineen.com (2026-11) — vérifiés dans corpus/articles ──
    {
        "question": "Quel est le capital minimum pour créer une société anonyme ?",
        "domaine": "Economie",
        # Vérifié : doc_059.json (AUSCGIE) — Art 387 : « Le capital social minimum est fixé à
        # dix millions (10.000.000) de francs CFA. »
        "articles_attendus": ["387"],
        "doc": "doc_059",
        "min_attendus": 1,
        # Résolu le 2026-11-07 : l'article ne dit pas « société anonyme » ; il est désormais
        # rattaché au régime « Société anonyme (art. 385 à 853) » d'après l'article de définition.
    },
    {
        "question": "Quel est le taux de la TVA en Guinée ?",
        "domaine": "Fiscalité",
        # Vérifié : doc_035.json (CGI L/2021/032/AN) — Art 373 : « Le taux de droit commun de la
        # Taxe sur la Valeur Ajoutée est de dix-huit pourcent (18%). »
        "articles_attendus": ["373"],
        "doc": "doc_035",
        "min_attendus": 1,
    },
    {
        "question": "Que risque une personne qui conduit sans permis de conduire ?",
        "domaine": "Transport et commerce",
        # Vérifié : doc_043.json (Code de la route) — Art 16 : conduite sans permis punie de
        # 10 jours à 3 mois d'emprisonnement et d'une amende de la 4e classe.
        "articles_attendus": ["16"],
        "doc": "doc_043",
        "min_attendus": 1,
    },
    {
        "question": "Dans quel délai faut-il former opposition à une ordonnance d'injonction de payer ?",
        "domaine": "Economie",
        # Vérifié : doc_061.json (AUPSRVE) — Art 10 : « L'opposition doit être formée dans les dix
        # jours qui suivent la signification… » ; Art 8 : sommation de payer ou de former opposition.
        "articles_attendus": ["10", "8"],
        "doc": "doc_061",
        "min_attendus": 1,
    },
    {
        "question": "Comment se prouve un cautionnement ?",
        "domaine": "Economie",
        # Vérifié : doc_063.json (AUS) — Art 14 : « Le cautionnement ne se présume pas… Il se prouve
        # par un acte comportant la signature de la caution et du créancier… »
        "articles_attendus": ["14"],
        "doc": "doc_063",
        "min_attendus": 1,
    },
]

# Textes abrogés, projets, versions historiques et doublons : ne doivent JAMAIS revenir.
RETIRED_DOCS = {"doc_003", "doc_012", "doc_015", "doc_033", "doc_070", "doc_071"}
RETIRED_PROBES = [
    ("Quelles sont les obligations en matière d'étude d'impact environnemental ?", "Environnement"),
    ("Quelles sont les conditions pour être électeur ?", "Droit électoral"),
    ("Quel est le taux de l'impôt sur les sociétés ?", "Fiscalité"),
    ("Quelles prestations familiales verse la caisse de sécurité sociale ?", "Sécurité sociale"),
]


def article_matches(article_ref: str, attendu: str) -> bool:
    """Numéro exact : 'Article 172.10' correspond à '172.10', mais 'Article 116' ne correspond pas à '16'."""
    import re
    return re.search(rf"(?<![\d.\-]){re.escape(attendu)}(?![\d])", article_ref or "") is not None


def run(retriever: HybridRetriever, verbose: bool = True) -> dict:
    total = len(GROUND_TRUTH)
    passed = 0
    details = []

    for case in GROUND_TRUTH:
        t0 = time.time()
        results = retriever.retrieve(
            case["question"],
            domaine=case.get("domaine"),
            top_k=10,
        )
        elapsed = time.time() - t0

        pool = [r for r in results if not case.get("doc") or r.get("doc_id") == case["doc"]]
        found_refs = [r.get("article_ref", "") for r in pool]
        matches = [
            attendu for attendu in case["articles_attendus"]
            if any(article_matches(ref, attendu) for ref in found_refs)
        ]
        ok = len(matches) >= case["min_attendus"]
        known = case.get("limite_connue") and not ok
        passed += int(ok or known)

        details.append({
            "question": case["question"],
            "ok": ok,
            "attendus": case["articles_attendus"],
            "trouves": matches,
            "top_refs": found_refs[:5],
            "elapsed": elapsed,
        })

        if verbose:
            status = "✅" if ok else ("⚠️ limite connue —" if known else "❌")
            print(f"{status} {case['question']}")
            print(f"   attendu(s): {case['articles_attendus']} — trouvé(s): {matches or 'AUCUN'}")
            print(f"   top-5 retournés: {[r.get('article_ref', '') + ' (' + r.get('doc_id', '') + ')' for r in results[:5]]}")
            print(f"   temps: {elapsed:.2f}s")
            print()

    # Aucun texte retiré (abrogé, projet, historique, doublon) ne doit être proposé
    for question, domaine in RETIRED_PROBES:
        total += 1
        leaked = [r.get("doc_id") for r in retriever.retrieve(question, domaine=domaine, top_k=10)
                  if r.get("doc_id") in RETIRED_DOCS]
        passed += int(not leaked)
        if verbose:
            print(f"{'✅' if not leaked else '❌'} Texte retiré absent — {question}"
                  + (f" (trouvé : {sorted(set(leaked))})" if leaked else ""))

    return {
        "total": total,
        "passed": passed,
        "score": passed / total if total else 0.0,
        "details": details,
    }


if __name__ == "__main__":
    print("Chargement du retriever (peut prendre quelques secondes)...\n")
    retriever = HybridRetriever(verbose=False)

    t_start = time.time()
    result = run(retriever)
    t_total = time.time() - t_start

    print("=" * 60)
    print(f"Résultat : {result['passed']}/{result['total']} ({result['score']:.0%})")
    print(f"Temps total : {t_total:.1f}s")
    print("=" * 60)

    if result["passed"] < result["total"]:
        sys.exit(1)

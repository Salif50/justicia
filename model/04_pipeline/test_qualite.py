"""
Test de qualité du pipeline RAG JusticIA-GN
============================================
Couvre tous les domaines juridiques guinéens.
Évalue : sources trouvées, structure, citations, langue.

Usage :
    cd model/04_pipeline
    python3 test_qualite.py
    python3 test_qualite.py --domaine travail
    python3 test_qualite.py --rapide          # 1 question par domaine
"""
import sys, time, re, argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

# ─── Questions de test par domaine ────────────────────────────────────────────
TESTS = [

    # ── DROIT DU TRAVAIL ──────────────────────────────────────────────────────
    {"domaine": "Droit du travail", "question": "Quels sont les droits d'un salarié licencié sans motif valable en Guinée ?"},
    {"domaine": "Droit du travail", "question": "Quelle est la durée légale du préavis pour un CDI en Guinée ?"},
    {"domaine": "Droit du travail", "question": "Comment calculer l'indemnité de licenciement selon l'ancienneté ?"},
    {"domaine": "Droit du travail", "question": "Quelles sont les protections légales d'une femme enceinte au travail ?"},
    {"domaine": "Droit du travail", "question": "Quelle est la durée maximale d'un CDD en Guinée ?"},

    # ── DROIT PÉNAL ───────────────────────────────────────────────────────────
    {"domaine": "Droit pénal", "question": "Quelle est la peine pour meurtre selon le Code pénal guinéen ?"},
    {"domaine": "Droit pénal", "question": "Quels sont les droits d'une personne en garde à vue en Guinée ?"},
    {"domaine": "Droit pénal", "question": "Quelle est la peine pour corruption de fonctionnaire en Guinée ?"},
    {"domaine": "Droit pénal", "question": "Comment est sanctionné le viol selon le Code pénal guinéen ?"},
    {"domaine": "Droit pénal", "question": "Quelles sont les conditions de la légitime défense en Guinée ?"},

    # ── DROIT DE LA FAMILLE ───────────────────────────────────────────────────
    {"domaine": "Droit de la famille", "question": "Quelles sont les causes légales de divorce en Guinée ?"},
    {"domaine": "Droit de la famille", "question": "Comment sont fixés les droits de garde des enfants après un divorce ?"},
    {"domaine": "Droit de la famille", "question": "Quel est l'âge minimum légal pour le mariage en Guinée ?"},
    {"domaine": "Droit de la famille", "question": "Quelles sont les règles de succession sans testament en Guinée ?"},
    {"domaine": "Droit de la famille", "question": "Quels droits le Code de l'enfant guinéen garantit-il ?"},

    # ── DROIT FONCIER ─────────────────────────────────────────────────────────
    {"domaine": "Droit foncier", "question": "Quelle est la procédure d'immatriculation foncière en Guinée ?"},
    {"domaine": "Droit foncier", "question": "Comment acquérir légalement un terrain en Guinée ?"},
    {"domaine": "Droit foncier", "question": "Quelle est la procédure légale d'expulsion d'un locataire en Guinée ?"},
    {"domaine": "Droit foncier", "question": "Comment fonctionne l'expropriation pour utilité publique en Guinée ?"},

    # ── DROIT CIVIL ───────────────────────────────────────────────────────────
    {"domaine": "Droit civil", "question": "Quelles sont les conditions de formation d'un contrat valable en Guinée ?"},
    {"domaine": "Droit civil", "question": "Comment fonctionne la responsabilité civile délictuelle en Guinée ?"},
    {"domaine": "Droit civil", "question": "Quelle est la durée de la prescription civile en Guinée ?"},

    # ── DROIT CONSTITUTIONNEL ─────────────────────────────────────────────────
    {"domaine": "Droit constitutionnel", "question": "Quels droits fondamentaux la Constitution guinéenne garantit-elle ?"},
    {"domaine": "Droit constitutionnel", "question": "Comment est organisé le pouvoir judiciaire selon la Constitution guinéenne ?"},

    # ── DROIT COMMERCIAL ──────────────────────────────────────────────────────
    {"domaine": "Economie", "question": "Quelles formalités pour créer une SARL en Guinée ?"},
    {"domaine": "Economie", "question": "Comment fonctionne l'arbitrage commercial en Guinée ?"},

    # ── DROIT MINIER ──────────────────────────────────────────────────────────
    {"domaine": "Mines et ressources naturelles", "question": "Quelles conditions pour obtenir un permis d'exploitation minière en Guinée ?"},
    {"domaine": "Mines et ressources naturelles", "question": "Quelles sanctions pour exploitation minière illégale en Guinée ?"},

    # ── HORS DOMAINE (doit refuser poliment) ─────────────────────────────────
    {"domaine": "HORS_DOMAINE", "question": "Quel est le montant du SMIC en France ?"},
    {"domaine": "HORS_DOMAINE", "question": "Comment fonctionne le droit du travail en Côte d'Ivoire ?"},
]


def evaluer_reponse(question: str, reponse: str, sources: list) -> dict:
    """Évalue automatiquement la qualité d'une réponse."""
    score = 0
    alertes = []

    # 1. Sources trouvées
    nb_sources = len(sources)
    if nb_sources >= 4:
        score += 3
    elif nb_sources >= 2:
        score += 2
    elif nb_sources == 1:
        score += 1
        alertes.append("⚠️  Peu de sources (1)")
    else:
        alertes.append("❌ AUCUNE SOURCE")

    # 2. Longueur réponse
    nb_chars = len(reponse)
    if nb_chars >= 500:
        score += 2
    elif nb_chars >= 200:
        score += 1
        alertes.append("⚠️  Réponse courte")
    else:
        alertes.append("❌ Réponse trop courte")

    # 3. Citations présentes
    has_citations = bool(re.search(r'Art\.|article|loi|code|§', reponse, re.IGNORECASE))
    if has_citations:
        score += 2
    else:
        alertes.append("⚠️  Aucune citation d'article")

    # 4. Structure (titres markdown)
    has_structure = bool(re.search(r'^#{1,3} |^\*\*', reponse, re.MULTILINE))
    if has_structure:
        score += 1

    # 5. "Documents consultés" présent
    has_docs = "documents consultés" in reponse.lower()
    if has_docs:
        score += 1
    else:
        alertes.append("⚠️  Section 'Documents consultés' absente")

    # 6. Langue (pas de chinois/autre)
    has_foreign = bool(re.search(r'[一-鿿぀-ゟ゠-ヿ]', reponse))
    if has_foreign:
        score -= 5
        alertes.append("🚨 TEXTE NON-FRANÇAIS DÉTECTÉ")

    # 7. Répétitions
    lignes = [l.strip() for l in reponse.split('\n') if len(l.strip()) > 30]
    if len(lignes) != len(set(lignes)):
        alertes.append("⚠️  Répétitions détectées")

    # Note finale /9
    note = max(0, min(9, score))
    if note >= 8:
        emoji = "🏆"
    elif note >= 6:
        emoji = "✅"
    elif note >= 4:
        emoji = "⚠️ "
    else:
        emoji = "❌"

    return {
        "note": note,
        "emoji": emoji,
        "nb_sources": nb_sources,
        "nb_chars": nb_chars,
        "alertes": alertes,
    }


def run_tests(filtre_domaine: str = None, rapide: bool = False):
    print("=" * 70)
    print("  JusticIA-GN — Test de qualité du pipeline RAG")
    print("=" * 70)

    from rag import JusticIAPipeline
    pipeline = JusticIAPipeline(verbose=False)
    print("✅ Pipeline chargé\n")

    tests = TESTS
    if filtre_domaine:
        tests = [t for t in tests if filtre_domaine.lower() in t["domaine"].lower()]
        print(f"🔍 Filtre : {filtre_domaine} → {len(tests)} questions\n")

    if rapide:
        # 1 question par domaine unique
        seen, tests_rapides = set(), []
        for t in tests:
            if t["domaine"] not in seen:
                seen.add(t["domaine"])
                tests_rapides.append(t)
        tests = tests_rapides
        print(f"⚡ Mode rapide : {len(tests)} questions (1/domaine)\n")

    resultats = []
    domaine_stats: dict[str, list] = {}

    for i, test in enumerate(tests, 1):
        domaine  = test["domaine"]
        question = test["question"]

        print(f"[{i:2d}/{len(tests)}] {domaine}")
        print(f"        Q: {question[:75]}...")

        t0 = time.time()
        try:
            # Passer le domaine uniquement si ce n'est pas hors-domaine
            dom_arg = domaine if domaine != "HORS_DOMAINE" else None
            reponse, sources = pipeline.answer(question, domaine=dom_arg, top_k=8)
            elapsed = time.time() - t0

            eval_r = evaluer_reponse(question, reponse, sources)
            refs   = [s.get("article_ref", "?") for s in sources[:3]]

            print(f"        {eval_r['emoji']} Note: {eval_r['note']}/9 | "
                  f"{eval_r['nb_sources']} sources | "
                  f"{eval_r['nb_chars']} chars | "
                  f"{elapsed:.1f}s")
            print(f"        Sources: {', '.join(refs) if refs else 'AUCUNE'}")
            for alerte in eval_r["alertes"]:
                print(f"        {alerte}")
            print()

            resultats.append({**test, **eval_r, "elapsed": elapsed, "refs": refs, "ok": True})
            domaine_stats.setdefault(domaine, []).append(eval_r["note"])

        except Exception as e:
            elapsed = time.time() - t0
            print(f"        ❌ ERREUR ({elapsed:.1f}s): {e}\n")
            resultats.append({**test, "note": 0, "emoji": "❌", "ok": False,
                              "alertes": [f"EXCEPTION: {e}"], "elapsed": elapsed})
            domaine_stats.setdefault(domaine, []).append(0)

    # ── Résumé ────────────────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  RÉSUMÉ PAR DOMAINE")
    print("=" * 70)

    tous_scores = []
    for domaine, scores in sorted(domaine_stats.items()):
        moy = sum(scores) / len(scores)
        tous_scores.extend(scores)
        barre = "█" * int(moy) + "░" * (9 - int(moy))
        emoji = "🏆" if moy >= 7 else "✅" if moy >= 5 else "⚠️ " if moy >= 3 else "❌"
        print(f"  {emoji} {domaine[:35]:35s} {barre} {moy:.1f}/9")

    score_global = sum(tous_scores) / len(tous_scores) if tous_scores else 0
    print(f"\n  Score global : {score_global:.1f}/9")

    # ── Questions faibles ─────────────────────────────────────────────────────
    faibles = [r for r in resultats if r.get("note", 0) < 5 and r.get("ok", False)]
    if faibles:
        print(f"\n{'=' * 70}")
        print(f"  ⚠️  QUESTIONS FAIBLES ({len(faibles)}) — à corriger en priorité")
        print("=" * 70)
        for r in sorted(faibles, key=lambda x: x["note"]):
            print(f"  {r['emoji']} [{r['note']}/9] {r['domaine']}")
            print(f"       {r['question'][:80]}")
            for a in r["alertes"]:
                print(f"       {a}")
            print()

    print(f"\n⏱️  Temps total : {sum(r.get('elapsed',0) for r in resultats):.0f}s")
    print(f"📋 {len([r for r in resultats if r.get('note',0) >= 6])}/{len(resultats)} questions satisfaisantes (≥6/9)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--domaine", default=None, help="Filtrer par domaine (ex: travail, penal, famille)")
    parser.add_argument("--rapide", action="store_true", help="1 question par domaine seulement")
    args = parser.parse_args()
    run_tests(filtre_domaine=args.domaine, rapide=args.rapide)

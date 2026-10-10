# Pipeline documentaire et rollback

## Source de vérité

Les JSON de corpus/articles/ sont la source actuellement utilisée par model/02_ingestion/ingest.py. Chaque fichier doc_*.json doit avoir une entrée dans corpus/metadata.json et un PDF source déclaré dans corpus/pdfs/.

Les PDF originaux restent immuables. Une correction d'extraction doit produire une nouvelle version d'article et conserver l'ancienne pour comparaison ; elle ne doit pas réécrire une citation légale sans revue.

## Contrôles avant indexation

    ./backend/env/bin/python model/02_ingestion/audit_corpus.py

Le contrôle signale les fichiers manquants, textes vides, références répétées et identifiants dupliqués. Les textes courts non vides sont conservés car « Abrogé » ou une exception courte peuvent être juridiquement décisifs.

## Indexation cohérente

L'ingestion calcule les mêmes identifiants depuis les mêmes articles pour BM25 et ChromaDB. Elle enrichit la recherche avec le titre, la référence et la hiérarchie, mais le texte original reste celui utilisé pour la citation.

Construire un staging sans toucher à l'index actif :

    ./backend/env/bin/python model/02_ingestion/ingest.py --version 20261003T000000Z

Après audit et revue, l'activation explicite crée un manifest actif et conserve le manifest précédent :

    ./backend/env/bin/python model/02_ingestion/ingest.py --activate-version 20261003T000000Z

Avant une bascule :

1. exécuter l'ingestion dans un espace/version parallèle ;
2. exécuter l'audit avec --check-indexes ;
3. lancer le benchmark de référence ;
4. conserver l'ancien index pour rollback ;
5. basculer les deux index ensemble, avec une version de corpus figée par requête.

La réindexation complète peut être coûteuse et n'est pas lancée automatiquement par l'application.

## PDF scannés et OCR

Pour un scan, rendre les pages puis produire les textes OCR avant parsing :

    pdftoppm -r 150 -png corpus/pdfs/codesecuritésociale.pdf /tmp/social/page
    for f in /tmp/social/page-*.png; do tesseract "$f" "${f%.png}" -l eng --psm 6; done
    ./backend/env/bin/python model/02_ingestion/extract_ocr_articles.py \
      /tmp/social corpus/articles/doc_034.json \
      --doc-id doc_034 --document "Code de sécurité sociale 1994"

Les documents extraits par OCR portent `verification_status: ocr_a_reviser`. Ils
restent recherchables, mais le prompt RAG interdit de les présenter comme une
règle en vigueur avant relecture humaine.

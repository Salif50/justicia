# Audit RAG JusticIA

Date de l'audit : 3 octobre 2026.

## Architecture observée

L'endpoint conversation vérifie le quota et l'utilisateur, charge au plus dix messages, puis appelle ask_rag() dans un thread. Le pipeline local charge un HybridRetriever (BM25 + ChromaDB + Solon embeddings + cross-encoder), récupère plusieurs variantes de la question, puis appelle le fournisseur LLM configuré. Les sources sont persistées avec le message, sauf en mode éphémère.

## Constats reproductibles

- metadata.json contient 32 documents.
- corpus/articles/ contient 28 fichiers JSON et 12 152 articles au total ; 12 149 sont non vides.
- corpus/corpus.jsonl contient 12 344 lignes mais seulement 28 doc_id. L'ingestion active ne le lit pas.
- Le vectorstore présent au moment de l'audit contient 12 056 articles.
- Le BM25 présent contient 12 149 identifiants.
- L'écart de 93 articles correspond aux textes courts non vides exclus par l'ancien seuil de 30 caractères. Ces textes comprennent notamment des dispositions « Abrogé » ; leur portée juridique doit rester visible et vérifiable.
- Deux PDF présents (codetravail.pdf, codesecuritésociale.pdf) ne sont pas référencés par metadata.json. Leur statut et leur relation avec les versions indexées restent à confirmer ; ils ne sont pas ajoutés automatiquement.
- codetravail.pdf a le même texte PDF normalisé que loi-L-2014-072-CNT-nouveau-code-de-travail.pdf (83 pages) : il est traité comme doublon documentaire, pas comme une nouvelle version.
- codesecuritésociale.pdf contient 26 pages image sans couche texte exploitable (pdftotext retourne 26 caractères de contrôle). Il nécessite une extraction OCR contrôlée avant toute inclusion.

Ces nombres sont une baseline locale reproductible, pas une validation juridique de l'extraction. Rejouer :

    ./backend/env/bin/python model/02_ingestion/audit_corpus.py --check-indexes

## Causes techniques établies

1. L'ancien seuil d'ingestion désynchronisait les deux index : BM25 conservait les textes non vides alors que ChromaDB les supprimait.
2. Les références d'article et le titre du document n'étaient pas systématiquement inclus dans le texte lexical/embeddé.
3. L'ancien pipeline ajoutait des requêtes HyDE contenant des affirmations juridiques pré-écrites. Elles pouvaient biaiser la recherche avant toute preuve documentaire.
4. La validation de citation ajoutait un avertissement mais laissait tout de même passer la réponse générée.

## Hypothèses restantes

- La qualité OCR des pages scannées n'est pas encore mesurée sur une transcription de référence.
- La validité actuelle, l'entrée en vigueur et les relations d'abrogation des textes ne sont pas déduites de la seule date du fichier ; une revue juridique est nécessaire.
- Les scores du cross-encoder ne sont pas des probabilités de vérité.

## Garde-fous implémentés

- Les textes non vides courts sont conservés.
- BM25 et ChromaDB doivent avoir le même nombre d'articles au chargement du retriever.
- Les blocs de contexte utilisent des identifiants S1, S2, etc. Le serveur résout ces identifiants vers les références exactes.
- Une réponse sans identifiant de source connu, ou avec un numéro d'article non retrouvé, est suspendue.
- Les requêtes de recherche n'utilisent plus de réponse juridique hypothétique.
- Les logs de requête utilisent un identifiant opaque et des durées, sans question ni réponse en clair.

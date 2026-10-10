# JusticIA — état du projet et prochaines étapes

## Résumé simple

Le moteur fonctionne déjà avec un corpus indexé et synchronisé. Les documents
juridiques sont maintenant recherchables par le système RAG.

Il reste principalement une étape de **relecture humaine des textes obtenus par
OCR**, car un OCR peut confondre certaines lettres ou certains accents. En
justice, une petite erreur de transcription peut modifier le sens d’un article.

## Ce qui est déjà terminé

- La page d’accueil, l’interface client et le menu mobile ont été améliorés.
- Le paiement Mosagix Pay dispose de ses contrôles et de ses tests.
- Le corpus est contrôlé automatiquement avant indexation.
- BM25 et ChromaDB utilisent exactement les mêmes identifiants.
- Les citations RAG sont contrôlées par des marqueurs de source (`S1`, `S2`, etc.).
- Le modèle refuse une citation inconnue ou une réponse sans source.
- Les questions de suivi conservent le contexte utile de la conversation.
- Le délai des appels RAG est surveillé sans enregistrer le contenu privé des utilisateurs.
- Le Code pénal a été corrigé à partir d’un texte déjà présent dans le fichier source.
- L’article 1 des marchés publics a été récupéré depuis le PDF scanné.
- Le Code de sécurité sociale 1994 a été extrait par OCR : 131 articles.
- L’index actif contient actuellement 12 282 articles.

## Ce qui reste à faire

### 1. Relire les textes OCR

Documents concernés :

- l’article 1 du document sur les marchés publics ;
- les 131 articles du Code de sécurité sociale 1994.

La relecture doit comparer chaque article avec son PDF original. Il faut corriger
uniquement les erreurs visibles du texte OCR, sans reformuler le contenu juridique.

Pour chaque correction, il faut conserver :

- le numéro de l’article ;
- la page du PDF ;
- le texte original vérifié ;
- le nom du relecteur ;
- la date de validation.

### 2. Ajouter le statut juridique des textes

Pour chaque document, il faut confirmer avec une source officielle :

- s’il est en vigueur ;
- sa date d’entrée en vigueur ;
- s’il a été modifié ;
- s’il a été abrogé ;
- s’il s’agit d’un projet ou d’un texte officiel.

Les documents OCR non relus portent actuellement le statut `ocr_a_reviser`.
Ils ne doivent pas être présentés automatiquement comme des règles certaines.

### 3. Créer un jeu de questions validées par un juriste

Le fichier de référence existe déjà :

`model/evaluation/rag_reference.jsonl`

Il faut ajouter pour chaque question :

- la réponse juridiquement attendue ;
- les articles obligatoires ;
- les articles qui ne doivent pas être cités ;
- la validation d’un juriste ;
- la date de validation.

Sans cette étape, on peut mesurer le fonctionnement technique, mais pas annoncer
la qualité juridique du modèle.

### 4. Mesurer les performances réelles

Après validation du jeu de référence, mesurer :

- Recall@K ;
- MRR ;
- nDCG ;
- temps médian (p50) ;
- temps lent (p95) ;
- résultats avec cache froid et cache chaud.

Les résultats devront être enregistrés dans :

`docs/rag_benchmark.md`

Il ne faut pas publier de score avant d’avoir des questions validées par un juriste.

### 5. Faire une validation fonctionnelle finale

Tester manuellement :

- une question avec une source officielle ;
- une question sur un document OCR non relu ;
- une question sans réponse dans le corpus ;
- une question de suivi ;
- une demande de citation précise ;
- un texte marqué comme projet ou abrogé.

Le système doit répondre avec prudence et afficher les sources exactes.

## Commandes de contrôle

Audit du corpus et des index :

```bash
./backend/env/bin/python model/02_ingestion/audit_corpus.py --check-indexes
```

Tests RAG :

```bash
PYTHONPATH=model/04_pipeline ./backend/env/bin/python -m unittest model/04_pipeline/test_guards.py -v
```

Test du retriever :

```bash
./backend/env/bin/python model/test_pipeline.py --retriever-only
```

Tests Mosagix Pay :

```bash
cd backend
PYTHONPATH=. ./env/bin/python -m unittest discover -s tests -p 'test_*.py' -v
```

## Ordre recommandé

1. Relire les 131 articles OCR.
2. Valider le statut juridique des documents avec les sources officielles.
3. Faire relire le jeu de questions par un juriste.
4. Lancer le benchmark de pertinence et de latence.
5. Effectuer la validation fonctionnelle finale.
6. Déployer seulement après ces contrôles.

## Conclusion

Le code et l’index technique sont prêts. La prochaine étape importante n’est pas
d’ajouter une nouvelle fonctionnalité : c’est de confirmer humainement que les
textes OCR et les statuts juridiques correspondent exactement aux documents
officiels.

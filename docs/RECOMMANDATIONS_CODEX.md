# JusticIA — Plan d’amélioration du RAG pour Codex

Date : 3 octobre 2026. Document de travail à placer dans le dépôt et à transmettre à Codex.

## 1. Mission et règles de travail

Améliorer la pertinence juridique, la traçabilité et la rapidité de JusticIA en conservant l’architecture existante lorsque cela est possible. Diagnostiquer, implémenter des changements progressifs, mesurer leurs effets et documenter les limites restantes.

Ce document repose sur la description du propriétaire, pas sur un audit du dépôt. Les causes proposées sont des hypothèses à vérifier. Ne pas présenter une recommandation comme un défaut déjà constaté. Aucun système ne peut garantir des réponses juridiques toujours correctes.

Instructions pour Codex :

1. Lire les instructions du dépôt, identifier les composants réels et relever les versions installées avant toute modification.
2. Examiner notamment `model/04_pipeline/rag.py`, l’endpoint `POST /conversation/send`, l’ingestion, les index et la gestion des conversations.
3. Produire une baseline reproductible, puis travailler par petites modifications réversibles. Préserver les changements du développeur et les contrats API existants.
4. Implémenter et vérifier les améliorations justifiées ; ne pas s’arrêter à une liste de conseils.
5. Ne pas remplacer une technologie ni ajouter un framework sans problème mesuré et bénéfice démontré.
6. Ne pas supprimer l’ancien corpus ni basculer la production pour simplement essayer une nouvelle extraction. Préparer migration et retour arrière.
7. Ne pas inventer d’articles attendus, de résultats de tests, de chiffres de performance ou d’état de validité des textes. Signaler les éléments nécessitant une validation juridique.
8. Mettre à jour une roadmap : à faire, en cours, implémenté, vérifié, bloqué. « Implémenté » ne signifie pas « validé juridiquement ».

## 2. Architecture déclarée

- Frontend → `POST /conversation/send` → FastAPI.
- Contrôle du quota, choix de l’agent et filtrage par domaine, chargement des derniers messages.
- Exécution de `ask_rag()` dans un thread.
- Pipeline : périmètre géographique, domaine, enrichissement de question, BM25 et recherche sémantique, fusion RRF, cross-encoder, environ dix articles, génération GPT.
- Persistance de la question, de la réponse et des sources, sauf mode éphémère.

Symptômes rapportés : réponses parfois lentes et articles parfois inadaptés. Une extraction OCR imparfaite est également suspectée. La base vectorielle, les modèles exacts, la taille du corpus et le matériel doivent être établis dans le dépôt.

## 3. Priorités

| Priorité | Travaux | Preuve attendue |
|---|---|---|
| P0 | Traces, benchmark, diagnostic des mauvaises références | Cause localisée par étape sur plusieurs cas |
| P0 | Correspondances exactes, historique de recherche, citations vérifiables | Tests de référence et de suivi réussis |
| P1 | Filtres, candidats, reranking, sélection du contexte | Gain de rappel et de classement sur jeu tenu à l’écart |
| P1 | Chargements, concurrence bornée, délais, contexte | Latences mesurées, sans perte de qualité |
| P1 | OCR et structure des articles | Comparaison avec transcription vérifiée |
| P2 | Versions juridiques, administration, retour utilisateur | Traçabilité et procédure d’actualisation |
| P2 | Cache, streaming, exploitation | Isolation, invalidation et erreurs testées |

## 4. Instrumenter avant d’optimiser

Créer un identifiant de requête et des mesures avec une horloge monotone : attente en file, quota, historique, reformulation, embedding, BM25, recherche vectorielle, RRF, reranking, construction du contexte, appel au modèle, validation des citations et persistance.

Séparer : délai avant premier événement de statut, délai avant premier token de réponse et durée jusqu’à réponse finalisée. Un statut « Recherche en cours » n’est pas le premier token de réponse.

Tracer les identifiants, rangs et scores des candidats à chaque étape ; modèles et versions ; version du corpus ; filtres ; cache hit/miss ; nombre de passages ; tokens ; erreurs et timeouts. Les scores de méthodes différentes ne sont pas directement comparables.

Par défaut, ne pas journaliser les questions, réponses ou dossiers personnels en clair. Prévoir un mode diagnostic expurgé, à accès restreint et durée de conservation définie. Le mode éphémère s’applique aussi aux logs, caches, traces et outils de suivi.

Diagnostic obligatoire pour chaque mauvais exemple :

- Article absent du corpus : problème de couverture.
- Article présent mais mal extrait : problème d’ingestion.
- Article exclu par filtre : problème de routage.
- Article absent des candidats : problème de recherche.
- Article présent puis éliminé : problème de fusion/reranking.
- Article transmis mais mal utilisé : problème de contexte/génération.

## 5. Construire un benchmark juridique

Commencer avec 30 à 50 questions représentatives ; élargir après les premiers correctifs. Pour les réponses attendues, utiliser des références vérifiées par un juriste compétent en droit guinéen. Codex peut préparer le jeu et l’outillage, mais ne doit pas s’auto-attribuer cette validation.

Inclure : référence explicite ; question pratique ; fautes de frappe ; conversation avec « et le délai ? » ; question multidomaine ; personne étrangère dans une situation en Guinée ; règle étrangère hors corpus ; ambiguïté ; absence de texte ; versions anciennes et nouvelles ; scan difficile ; exceptions ; renvois entre articles.

Schéma indicatif d’un cas :

```json
{
  "case_id": "case_001",
  "question": "Question à renseigner",
  "history": [],
  "requested_date": null,
  "expected_source_ids": [],
  "expected_behavior": "answer|clarify|insufficient_sources|out_of_scope",
  "required_points": [],
  "forbidden_claims": [],
  "legal_review_status": "pending"
}
```

Mesurer séparément :

- Recall@K : fraction des références pertinentes attendues effectivement récupérées ; compléter par la proportion des questions où toutes les références nécessaires sont présentes.
- MRR pour les cas où une référence principale est identifiée ; nDCG si des jugements de pertinence gradués existent.
- Présence de la preuve dans le contexte final, pas seulement dans les candidats.
- Existence des citations, fidélité des extraits, soutien réel des affirmations, couverture des affirmations importantes.
- Bon comportement sur les cas ambigus et sans preuve ; nombre de refus excessifs.
- Latences p50/p95, taux d’erreur, tokens et coût estimé par réponse.

Séparer jeu de réglage et jeu d’évaluation tenu à l’écart, sans paraphrases quasi identiques réparties entre les deux. Un juge LLM peut aider au tri, mais ne remplace pas la revue juridique. Publier le nombre de cas et les échecs, pas seulement un pourcentage global.

## 6. Corriger la recherche

### 6.1 Questions et historique

Vérifier que l’historique sert à la recherche, pas uniquement au prompt final. Construire une question autonome pour les suivis, en conservant les faits donnés. Ne pas inventer un statut professionnel, une date ou un pays. Détecter les changements de sujet. Demander une précision si une ambiguïté détermine le fondement juridique.

Conserver question originale et reformulation. Tester l’enrichissement comme branche complémentaire ; ne pas substituer aveuglément des synonymes au vocabulaire juridique d’origine.

### 6.2 Références exactes

Ajouter un chemin déterministe pour document + numéro d’article + version/date lorsqu’elle est connue. Gérer accents, abréviations et numéros avec suffixes sans confondre « 1 », « 10 » et « 101 ». Un numéro seul peut correspondre à plusieurs textes : ne pas choisir arbitrairement.

Préserver les champs exacts même si un champ normalisé est ajouté pour la recherche. Tester que des références explicites trouvent leur passage dans le corpus de référence.

### 6.3 Domaines, pays et permissions

Permettre plusieurs domaines et tester une préférence de classement plutôt qu’un filtre juridique exclusif. Effectuer au maximum une recherche élargie contrôlée si les preuves sont insuffisantes. Une nationalité étrangère ne signifie pas nécessairement une question de droit étranger.

Ne jamais élargir les filtres d’autorisation, d’organisation ou d’accès documentaire. Distinguer ces restrictions obligatoires des filtres thématiques ajustables.

### 6.4 Recherche hybride et reranking

Vérifier que BM25 et les vecteurs portent sur le même corpus, les mêmes identifiants et la même version. Vérifier aussi le modèle d’embedding utilisé à l’indexation et à la requête, les dimensions, la métrique et la normalisation requise par le modèle.

Dédupliquer les candidats par passage/version ; ne pas fusionner des versions juridiques distinctes. RRF fusionne des rangs, pas des scores bruts incompatibles.

Exemples de valeurs à comparer, non paramètres garantis : 20/40/80 candidats par branche ; 20/40/60 passages rerankés ; contexte de 4/8/12 passages dans un budget de tokens. Mesurer qualité et latence pour choisir. Vérifier la prise en charge du français, la longueur maximale et la troncature du cross-encoder : une exception en fin d’article ne doit pas disparaître silencieusement.

Ajouter, si nécessaire, le parent de l’article, ses alinéas voisins ou les articles explicitement référencés, dans un budget limité. Ne pas lancer une expansion récursive incontrôlée.

Un score de reranking n’est pas une probabilité de vérité juridique. Calibrer le comportement d’abstention sur le benchmark et sur la suffisance des preuves.

## 7. Fiabiliser les documents et l’OCR

Traiter l’ingestion hors du chemin de réponse utilisateur. Conserver le fichier original immuable, son empreinte, son origine et les paramètres d’extraction.

Classifier chaque page : numérique exploitable, scan, couche OCR suspecte, page mixte. Extraire directement le texte valide ; refaire l’OCR si nécessaire ; vérifier orientation et ordre de lecture. Ne pas appliquer systématiquement un traitement d’image destructeur. Aucune amélioration d’image ne peut garantir de reconstruire des caractères absents.

Comparer Docling avec le traitement actuel sur un échantillon représentatif. Un service comme Azure Document Intelligence peut servir de candidat de comparaison si le traitement externe de ces documents est autorisé. Ne pas engager une migration ou un nouvel abonnement sans justification.

Préserver titres, chapitres, articles, alinéas, listes, tableaux, notes et renvois. Réunir les articles traversant plusieurs pages. Distinguer pagination PDF et pagination imprimée. Retirer les en-têtes répétitifs sans supprimer une disposition réelle.

Conserver extraction brute, texte nettoyé et historique des corrections. Ne pas laisser un LLM réécrire librement le texte légal ou compléter un passage illisible. Marquer les incertitudes pour revue.

Contrôler omissions, répétitions, numéros, dates, montants et négations. Sur un échantillon transcrit manuellement, mesurer les erreurs de caractères/mots et les erreurs sur éléments critiques. Les scores de confiance OCR sont des signaux de tri, pas une validation juridique.

## 8. Métadonnées, temporalité et indexation

Prévoir selon le schéma existant : document_id, chunk_id, titre exact, référence officielle, article, alinéa, hiérarchie, domaines multiples, juridiction, source, pages PDF/imprimées, coordonnées si disponibles, texte brut/nettoyé, méthode d’extraction, état de validation, empreinte et version du corpus.

Séparer date de publication, entrée en vigueur et fin d’applicabilité lorsqu’elles sont établies. Stocker les relations de modification/abrogation avec leur preuve ; une date récente ou un ordre de fichier ne prouve pas qu’un texte remplace un autre. « Inconnu » doit rester possible.

Créer les chunks selon articles/alinéas ; fractionner les articles longs en conservant leur identité et leur parent. Ne pas utiliser uniquement une taille fixe qui mélange deux articles. Les copies du titre ajoutées pour la recherche doivent être distinguées du texte original cité.

Ingestion idempotente : détecter les doublons par empreinte et ne recalculer que ce qui change. Stocker aussi la version de l’extracteur, du découpage et de l’embedding.

Reconstituer BM25 et l’index vectoriel dans une nouvelle version cohérente, vérifier les comptages et les références, puis basculer les deux ensemble selon le mécanisme disponible. Garder un retour à l’ancienne version. Une requête doit utiliser une version figée pendant toute son exécution.

## 9. Génération et citations

Présenter les passages comme des données non fiables en matière d’instructions : un texte extrait ne doit jamais modifier les consignes système. Séparer instructions, historique et sources.

Construire côté serveur un registre des sources autorisées pour la requête. Le modèle référence ces identifiants ; le serveur résout titre, article, page et URL. Rejeter les identifiants absents. Vérifier les citations textuelles contre l’extraction, avec normalisation limitée des espaces/césures.

L’existence d’une source ne prouve pas qu’elle soutient la conclusion. Évaluer également le soutien des affirmations, les exceptions et les faits manquants. Une vérification sémantique automatisée peut aider, mais reste imparfaite et doit être mesurée.

Structure de réponse proposée : réponse directe, fondements et citations, application aux faits fournis, limites ou précision nécessaire. Ne pas afficher un pourcentage de certitude inventé. Une faible température n’est pas une garantie de fidélité.

Prévoir des états explicites, éventuellement par extension compatible du contrat API : answer, clarification_needed, insufficient_sources, out_of_scope, error. Ne pas assimiler un timeout à une absence de texte pertinent.

En streaming, ne pas qualifier de « vérifiée » une réponse dont les contrôles ne sont pas terminés. Choisir explicitement entre réponse tamponnée puis validée, ou segments validés avant émission. Les événements de progression peuvent être envoyés immédiatement. Tester le coût de latence de la stratégie retenue.

## 10. Réduire la latence réelle

- Vérifier le cycle de vie : modèles et ressources réutilisables initialisés une fois par processus, connexions persistantes et pools adaptés ; pas de reconstruction d’index à chaque question.
- Mesurer le démarrage à froid séparément du régime chaud. Plusieurs workers peuvent multiplier la mémoire du reranker ; choisir leur nombre selon CPU/GPU/RAM disponibles.
- Exécuter en parallèle les recherches indépendantes quand les clients le permettent, avec concurrence bornée et délais. Ne pas déplacer du calcul CPU lourd dans la boucle asynchrone.
- Un thread protège la boucle FastAPI mais n’accélère pas automatiquement le calcul. Profiler avant de choisir thread, processus ou service de modèle.
- Regrouper les traitements compatibles de préparation ; éviter plusieurs appels LLM successifs pour de petites décisions pouvant être déterministes.
- Dédupliquer avant le reranking ; privilégier un batch compatible avec le modèle plutôt qu’un appel par article.
- Borner contexte et longueur de réponse sans supprimer définitions et exceptions nécessaires.
- Définir deadline globale, délais par dépendance, tentatives limitées avec backoff et annulation propagée. Ne pas relancer indéfiniment une génération coûteuse.
- Limiter les appels simultanés et prévoir la saturation. Tester les requêtes concurrentes et les déconnexions client.

Fixer les objectifs de latence après la baseline. Cible de travail possible : diminuer d’au moins 25 % la p95 à charge identique sans régression juridique mesurée. Ce chiffre est une cible à adapter, pas une promesse ni un résultat acquis.

## 11. Cache, quotas et persistance

Commencer par les ressources et les calculs réutilisables, puis évaluer le cache de recherche. Ne pas introduire un cache sémantique de réponses juridiques comme raccourci initial : deux situations proches peuvent avoir des règles différentes.

Une clé de cache doit inclure tous les déterminants du résultat : question autonome et contexte pertinent, date demandée, domaine, version du corpus, modèles/paramètres, langue et périmètre d’accès. Invalider sur changement de corpus ou de modèle. Ne jamais partager des réponses personnelles entre utilisateurs. Respecter le mode éphémère et les règles de conservation.

Quota : vérifier l’atomicité sous concurrence, le comportement en cas d’échec et les retries. Utiliser une clé d’idempotence liée à l’utilisateur et au message si le contrat le permet. Ne pas modifier la politique commerciale sans instruction ; documenter comment une réservation est confirmée ou libérée.

Persistance : distinguer réponse en cours, terminée, annulée et échouée. Un retry ne doit pas doubler messages ni consommation. Enregistrer pour une réponse finale la version du corpus et les sources nécessaires à sa traçabilité ; ne pas marquer un flux partiel comme réponse finale.

## 12. Autres améliorations produit et exploitation

- Afficher les sources au niveau des affirmations et permettre d’ouvrir la bonne page, sous contrôle d’accès.
- Ajouter « source incorrecte », « réponse incomplète » et « trop lent » avec request_id ; demander un commentaire facultatif, sans collecte excessive.
- Prévoir un écran interne pour documents en échec, pages à revoir, version du corpus et dates d’actualisation.
- Distinguer absence de couverture documentaire et absence de règle juridique : JusticIA ne doit pas affirmer qu’aucun texte n’existe simplement parce qu’il n’en trouve pas.
- Tester l’isolation des conversations et documents, les injections dans les PDF, les liens malveillants et les accès par identifiants devinés.
- Lors de l’ingestion, borner taille/pages/temps, isoler l’analyse de fichiers et vérifier les téléchargements distants pour éviter les accès réseau internes non autorisés.
- Suivre taux d’erreur, saturation, p95, coût, absence de preuve et signalements. Définir une procédure de rollback et de mise à jour documentaire.

## 13. Critères de validation

| Domaine | Critère |
|---|---|
| Référence exacte | Tous les cas non ambigus du jeu dédié retrouvent le bon document/article/version |
| Citations | Aucun identifiant inventé ou lien non autorisé dans les tests ; extraits vérifiables |
| Preuve | Pas de nouvelle affirmation juridique non soutenue sur les cas critiques vérifiés |
| Ambiguïté | Clarification lorsque le fait manquant détermine la réponse |
| Recherche | Comparaison avant/après du rappel et du classement, résultats par catégorie |
| Performance | p50/p95, charge, machine, cache chaud/froid, modèles et tokens documentés |
| Confidentialité | Isolation et mode éphémère couverts par tests |
| Résilience | Timeouts, saturation, annulation et retries sans doublons testés |
| Migration | Index cohérents et retour arrière vérifié avant bascule |

Ces critères portent sur le périmètre testé et ne prouvent pas une fiabilité universelle. Si aucune validation juridique n’est disponible, livrer les améliorations techniques en indiquant explicitement cette limite et les cas en attente.

## 14. Livrables attendus de Codex

Adapter les noms à l’organisation du dépôt :

1. `docs/rag_audit.md` : architecture observée, causes établies, hypothèses restantes.
2. `docs/rag_roadmap.md` : tâches, priorités, état et critères de validation.
3. Jeu de référence et script reproductible d’évaluation, sans données personnelles réelles par défaut.
4. Correctifs progressifs, tests ciblés et paramètres documentés dans la configuration d’exemple.
5. `docs/rag_benchmark.md` : baseline et résultats après changements ; aucun résultat inventé.
6. `docs/corpus_pipeline.md` : extraction, validation, versionnement, indexation et rollback.
7. Rapport final court : changements, preuves, limites, actions nécessitant revue juridique ou accès manquant.

Ordre d’exécution : inspecter → instrumenter → établir baseline → corriger les causes démontrées → évaluer → préparer migration → documenter. Ne pas remplacer cette progression par une réécriture globale.

## 15. Références techniques à consulter

Ces références documentent des capacités d’outils ; elles ne démontrent pas leur supériorité sur les documents de JusticIA. Vérifier la documentation correspondant aux versions réellement installées avant d’écrire du code.

- Docling, rapport technique : https://arxiv.org/abs/2501.17887
- Docling, OCR pleine page : https://docling-project.github.io/docling/_generated/examples/full_page_ocr/
- Docling, configurations et moteurs OCR : https://docling-project.github.io/docling/_generated/examples/custom_convert/
- Azure Document Intelligence, modèle Layout : https://learn.microsoft.com/azure/ai-services/document-intelligence/prebuilt/layout

## Instruction de démarrage à donner à Codex

> Lis ce fichier et les instructions du dépôt. Audite l’implémentation réelle de JusticIA, établis une baseline reproductible, puis applique progressivement les améliorations prioritaires justifiées par les mesures. Préserve les interfaces existantes et mes modifications. Vérifie pertinence, citations, latence, confidentialité et erreurs. Mets à jour la roadmap à chaque étape vérifiée. N’invente ni résultats ni validation juridique. Prépare les migrations avec retour arrière et indique clairement ce qui reste à valider avant une mise en production.

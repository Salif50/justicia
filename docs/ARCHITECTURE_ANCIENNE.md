# JusticIA — Arborescence du projet

## Vue d'ensemble

```
JusticIA/
├── backend/          ← API FastAPI (Python)
├── web/              ← Frontend Angular 20
├── model/            ← Pipeline RAG (approche actuelle en production)
├── corpus/           ← Données juridiques guinéennes (source de vérité)
├── training/         ← Entraînement du modèle personnalisé (futur)
├── docs/             ← Documentation du projet
└── juriadata/        ← Archive des anciens scripts (ne pas toucher)
```

---

## Détail de chaque répertoire

---

### `backend/`
> **API REST FastAPI — le cerveau serveur de JusticIA**

```
backend/
├── app/
│   ├── core/         ← Sécurité JWT, dépendances, feature flags
│   ├── models/       ← Modèles ORM (User, Conversation, Case, Subscription…)
│   ├── routers/      ← Endpoints API (/auth, /conversation, /cases, /admin…)
│   ├── schemas/      ← Schémas Pydantic (validation entrée/sortie)
│   └── services/     ← Logique métier (rag_service.py, llm_service.py…)
├── .env              ← Variables d'environnement (DB, clés API, Ollama…)
├── main.py           ← Point d'entrée FastAPI
├── requirements.txt  ← Dépendances Python
└── start.sh          ← Script de démarrage
```

**Quand l'ouvrir :**
- Quand tu ajoutes ou modifies un endpoint API
- Quand tu touches à la base de données (modèles ORM, migrations)
- Quand tu travailles sur l'authentification, les abonnements, les dossiers judiciaires
- Quand tu intègres un nouveau provider LLM dans `rag_service.py`
- Quand tu gères les quotas, permissions ou feature flags

**Fichier clé à connaître :** `backend/app/services/rag_service.py`
→ C'est lui qui fait le pont entre l'API et le pipeline RAG dans `model/`

---

### `web/`
> **Frontend Angular 20 — l'interface utilisateur**

```
web/src/app/
├── pages/            ← Toutes les pages (accueil, dashboard, conversation…)
├── components/       ← Composants réutilisables (header, sidebar…)
├── services/         ← Appels API, gestion état
├── guards/           ← Protections de routes (auth, guest, onboarding)
├── layouts/          ← Layouts dashboard et admin
└── app.routes.ts     ← Définition de toutes les routes
```

**Quand l'ouvrir :**
- Quand tu travailles sur l'interface utilisateur (design, UX, pages)
- Quand tu ajoutes une nouvelle page ou un nouveau composant
- Quand tu connectes l'UI à un nouvel endpoint backend
- Quand tu testes le rendu visuel dans le navigateur

**Commande de démarrage :**
```bash
cd web && ng serve
```

---

### `model/`
> **Pipeline RAG — l'intelligence juridique actuelle (en production)**

```
model/
├── 02_ingestion/
│   └── ingest.py     ← Lit corpus/articles/, génère ChromaDB + BM25
├── 03_vectorstore/   ← Base vectorielle ChromaDB + index BM25 (généré)
├── 04_pipeline/
│   ├── retriever.py  ← HybridRetriever (BM25 + Solon + RRF + Cross-encoder)
│   └── rag.py        ← Pipeline complet + détection domaine + appel LLM
├── .env              ← Config provider LLM (Ollama par défaut)
└── test_pipeline.py  ← Tests end-to-end du pipeline
```

**Quand l'ouvrir :**
- Quand tu modifies la logique de recherche ou de récupération d'articles
- Quand tu changes de modèle d'embedding ou de cross-encoder
- Quand tu ajoutes un nouveau domaine juridique dans `rag.py`
- Quand tu améliores le prompt système ou la détection de domaine
- Quand tu veux tester le pipeline avant de déployer

**Commandes essentielles :**
```bash
# Réindexer tout le corpus (après changement de modèle ou de données)
cd model && python 02_ingestion/ingest.py

# Tester l'état actuel du vectorstore
python test_pipeline.py --status

# Tester le retriever seul (sans LLM, rapide)
python test_pipeline.py --retriever-only

# Tester le pipeline complet
python test_pipeline.py --provider ollama
```

**Important :** Après chaque modification de `ingest.py` ou changement dans `corpus/`,
tu dois **relancer `ingest.py`** pour régénérer ChromaDB et BM25.

---

### `corpus/`
> **Données juridiques guinéennes — la source de vérité**

```
corpus/
├── articles/         ← 32 fichiers JSON structurés (doc_001.json … doc_033.json)
│                        Format : liste d'articles avec article_ref, texte, hiérarchie
├── pdfs/             ← 34 PDFs officiels des textes de loi guinéens
├── corpus.jsonl      ← Corpus complet fusionné (12 344 articles, format JSONL)
└── metadata.json     ← Métadonnées de chaque document (nom, domaine, date, source…)
```

**Quand l'ouvrir :**
- Quand tu veux **ajouter un nouveau texte de loi** : place le PDF dans `pdfs/`
  et extrait les articles dans un nouveau `doc_0XX.json` dans `articles/`
- Quand tu veux vérifier quels textes sont couverts : consulte `metadata.json`
- Quand tu prépares des données pour l'entraînement (voir `training/`)
- Quand `ingest.py` signale un problème de JSON : corriger le fichier concerné

**Après toute modification dans `corpus/articles/` :**
→ Relancer `python model/02_ingestion/ingest.py` pour mettre à jour la base vectorielle

**Textes actuellement couverts :** 32 documents (codes, lois, décrets guinéens)
→ Code du travail, Code pénal, Code civil, Constitution 2025, Code foncier,
   Code minier, Code maritime, Code fiscal, Charte de transition, et plus encore

---

### `training/`
> **Entraînement du modèle personnalisé — pour le futur**

```
training/
├── notebooks/
│   ├── JusticIA_GN_v1_FineTuning.ipynb    ← Première version (référence)
│   └── JusticIA_GN_v2_Colab_Pro.ipynb     ← Version actuelle (Google Colab Pro H100)
├── scripts/
│   ├── generate_training_data.py  ← Génère des paires question/réponse depuis corpus/
│   ├── prepare_dataset.py         ← Formate le dataset pour l'entraînement QLoRA
│   └── train_qlora.py             ← Entraînement local (MLX ou CUDA)
├── modelfiles/
│   └── Modelfile.justicia-gn      ← Config Ollama pour créer le modèle local
├── data/
│   └── training_data_ollama.jsonl ← Dataset actuel (163 paires Q&R générées)
└── checkpoints/
    ├── Qwen2.5-14B-Instruct.Q4_K_M.gguf  ← Modèle de base quantifié (8.4 GB)
    └── checkpoint_ollama.json             ← Dernier checkpoint sauvegardé
```

**Quand l'ouvrir :**
- Quand tu veux **améliorer le dataset d'entraînement** : modifier `generate_training_data.py`
  puis relancer pour enrichir `training/data/training_data_ollama.jsonl`
- Quand tu lances un **entraînement sur Google Colab** :
  ouvrir `notebooks/JusticIA_GN_v2_Colab_Pro.ipynb` dans Colab Pro (GPU H100)
- Quand tu veux **recréer le modèle Ollama** après un nouvel entraînement :
  ```bash
  cd training/modelfiles
  ollama create justicia-gn-ft -f Modelfile.justicia-gn
  ```
- Quand tu veux **ajouter plus de données d'entraînement** depuis le corpus enrichi

**Workflow d'entraînement complet :**
```
1. Enrichir corpus/articles/ → 2. Régénérer training/data/ → 3. Lancer Colab (H100)
→ 4. Récupérer le .gguf → 5. Placer dans training/checkpoints/
→ 6. ollama create justicia-gn-ft -f Modelfile.justicia-gn
→ 7. Tester avec python model/test_pipeline.py --provider ollama
```

---

### `docs/`
> **Documentation du projet**

```
docs/
├── ROADMAP.md         ← Feuille de route (Q2 2026 → 2027)
├── OLLAMA_SETUP.md    ← Guide installation et configuration Ollama
├── QUESTIONS_TEST.md  ← Questions de test pour valider le pipeline RAG
└── admin.md           ← Notes d'administration
```

**Quand l'ouvrir :**
- Quand tu veux consulter la feuille de route pour planifier la prochaine fonctionnalité
- Quand tu onboardes un nouveau développeur sur le projet
- Quand tu configures Ollama sur une nouvelle machine

---

### `juriadata/` *(archive — ne pas modifier)*
> **Anciens scripts de prototypage — conservés pour référence uniquement**

```
juriadata/
├── _archive/     ← Scripts expérimentaux (grok.py, rag proto, web app proto…)
├── qdrant_db/    ← Ancien vectorstore Qdrant (remplacé par ChromaDB dans model/)
└── logs/         ← Logs d'extraction des PDFs
```

**Quand l'ouvrir :** Presque jamais.
Uniquement si tu cherches un algorithme ou une logique dans un ancien prototype.
Tout ce qui est utile a été déplacé dans `corpus/`, `model/` ou `training/`.

---

## Résumé : Quoi ouvrir selon ta tâche

| Tu veux faire… | Dossier à ouvrir |
|---|---|
| Modifier l'interface utilisateur | `web/` |
| Ajouter un endpoint API | `backend/` |
| Améliorer la recherche juridique (RAG) | `model/04_pipeline/` |
| Réindexer les données | `model/02_ingestion/` + `corpus/` |
| Ajouter un nouveau texte de loi | `corpus/` → puis réindexer |
| Créer plus de données d'entraînement | `training/scripts/` |
| Lancer un fine-tuning sur Colab | `training/notebooks/` |
| Reconfigurer Ollama | `training/modelfiles/` + `backend/.env` |
| Consulter la roadmap | `docs/ROADMAP.md` |

---

## Flux de données (comment tout s'articule)

```
corpus/pdfs/         ← PDFs officiels des textes de loi
     ↓ (extraction manuelle)
corpus/articles/     ← Articles JSON structurés
     ↓ ingest.py
model/03_vectorstore ← ChromaDB (sémantique) + BM25 (lexical)
     ↓ retriever.py
model/04_pipeline/   ← Pipeline RAG hybride
     ↓ rag_service.py
backend/             ← API REST
     ↓ HTTP
web/                 ← Interface utilisateur

corpus/articles/     ← Même source de données
     ↓ generate_training_data.py
training/data/       ← Dataset d'entraînement
     ↓ Colab Pro (H100)
training/checkpoints ← Modèle fine-tuné (.gguf)
     ↓ ollama create
Ollama local         ← justicia-gn-ft (utilisé par backend/.env)
```

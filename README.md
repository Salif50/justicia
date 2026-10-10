# JusticIA

Assistant juridique pour le droit guinéen : réponses sourcées article par article,
outils pour les professionnels du droit (procès, agenda, génération et analyse de documents).

## Organisation du projet

```
JusticIA/
├── backend/    API FastAPI (auth, conversations, admin, paiements…)
├── frontend/   Application Angular — déployée sur Vercel
├── model/      Moteur IA : corpus de lois, indexation, recherche (RAG)
├── deploy/     Docker (API + PostgreSQL + HTTPS) — identique en local et sur le VPS
└── docs/       Documentation produit et technique
```

| Je veux…                                   | Où aller                         |
|--------------------------------------------|----------------------------------|
| Modifier l'API ou la base de données       | `backend/app/`                   |
| Modifier l'interface                       | `frontend/src/app/`              |
| Ajouter un texte de loi / réindexer        | `model/` → voir `model/README.md`|
| Améliorer la qualité des réponses (RAG)    | `model/04_pipeline/`             |
| Déployer ou lancer le backend en Docker    | `deploy/` → voir `deploy/README.md` |

## Démarrage local

**Backend avec Docker** (rien d'autre à installer que Docker) :

```bash
cd deploy
cp .env.example .env        # remplir au minimum SECRET_KEY, POSTGRES_PASSWORD, OPENAI_API_KEY
./up.sh                     # API sur http://localhost:8000
```

**Backend sans Docker** (PostgreSQL local + environnement Python `backend/env`) :

```bash
./backend/run_dev.sh        # http://localhost:8000 (rechargement automatique)
```

**Frontend** :

```bash
cd frontend
npm install
npm start                   # http://localhost:4200 — appelle l'API sur localhost:8000
```

## Production

- **Frontend → Vercel** : importer le dossier `frontend/` (voir `frontend/README.md`).
- **Backend → VPS** : Docker + HTTPS automatique (voir `deploy/README.md`).

## Fichiers secrets (jamais versionnés)

`backend/.env` · `model/.env` · `deploy/.env` — chacun a son modèle `.env.example` à côté.

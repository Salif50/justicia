# Déployer le backend JusticIA (Docker)

Une seule stack pour le local et le VPS : **API FastAPI + moteur IA + PostgreSQL**,
plus un proxy **HTTPS automatique** (Caddy) activé seulement sur le VPS.
Le frontend n'est pas ici : il est déployé sur Vercel.

```
deploy/
├── docker-compose.yml        services db, api (+ caddy pour HTTPS)
├── Dockerfile                image de l'API (Python 3.12, PyTorch CPU)
├── Dockerfile.dockerignore   seul backend/ entre dans l'image
├── entrypoint.sh             attend PostgreSQL puis lance uvicorn
├── Caddyfile                 reverse proxy HTTPS devant l'API
├── .env.example              modèle de configuration → copier en .env
├── up.sh                     construire + démarrer (local et VPS)
├── stop.sh                   tout arrêter (données conservées)
├── restart.sh                redémarrer l'API (--all : tout · --build : reconstruire)
├── sync-model.sh             envoyer model/ vers le VPS
└── seed-hf-cache.sh          (local) réutiliser les modèles déjà téléchargés sur le Mac
```

Le moteur IA (`model/`) **n'est pas copié dans l'image** : il est monté dans le
conteneur (`/app/model`), en lecture seule sauf l'index `03_vectorstore/` (ChromaDB
s'appuie sur SQLite, qui a besoin d'écrire ses fichiers de verrou même pour lire).
Une réindexation ne demande donc pas de reconstruire l'image.

## En local

```bash
cd deploy
cp .env.example .env
# Éditer .env : POSTGRES_PASSWORD (+ les 2 DATABASE_URL), SECRET_KEY, OPENAI_API_KEY
./up.sh
curl http://localhost:8000/health      # "rag": {"ready": true}
```

Si un backend tourne déjà sur le port 8000 (`run_dev.sh`), mettre `API_PORT=8001` dans `.env`.

Premier démarrage : à la première question, l'API télécharge ~2,5 Go de modèles
d'embedding. Sur une connexion lente, copiez plutôt ceux déjà présents sur le Mac :
`./seed-hf-cache.sh` (une seule fois, ils restent dans le volume `hf_cache`).

| Action                                  | Commande (depuis `deploy/`)   |
|-----------------------------------------|-------------------------------|
| Démarrer / mettre à jour                | `./up.sh`                     |
| Redémarrer l'API (après réindexation)   | `./restart.sh`                |
| Redémarrer tous les services            | `./restart.sh --all`          |
| Reconstruire (après modif du backend)   | `./restart.sh --build`        |
| Tout arrêter                            | `./stop.sh`                   |
| Logs de l'API                           | `docker compose logs -f api`  |
| Effacer la base   | `docker compose down -v` ⚠️ irréversible |

## Sur le VPS

Prérequis : Docker + Docker Compose, **4 Go de RAM** minimum, un nom de domaine pour l'API.

1. **DNS** : créer un enregistrement `A` `api.votre-domaine.com` → IP du VPS.
   Ouvrir les ports 80 et 443 (pas besoin d'ouvrir 8000).
2. **Code** : cloner le dépôt sur le VPS, par exemple dans `/opt/JusticIA` :
   ```bash
   git clone git@github.com:<compte>/JusticIA.git /opt/JusticIA
   ```
3. **Index du moteur IA** (exclu de Git car trop lourd : ~540 Mo) — depuis votre Mac :
   ```bash
   ./deploy/sync-model.sh user@ip-du-vps:/opt/JusticIA
   ```
4. **Configuration** sur le VPS :
   ```bash
   cd /opt/JusticIA/deploy
   cp .env.example .env
   ```
   Renseigner : mots de passe, `SECRET_KEY` (`openssl rand -hex 32`), clé LLM, et
   - `API_DOMAIN=api.votre-domaine.com` → active HTTPS
   - `FRONTEND_URL`, `APP_PUBLIC_FRONTEND_URL`, `CORS_ORIGINS` = URL Vercel
   - `BACKEND_URL`, `APP_PUBLIC_BACKEND_URL` = `https://api.votre-domaine.com`
5. **Lancer** : `./up.sh`, puis vérifier `https://api.votre-domaine.com/health`.
6. **Vercel** : définir `API_URL=https://api.votre-domaine.com` dans le projet frontend.

### Mettre à jour

- Code backend : `git pull` puis `./up.sh` (reconstruit l'image).
- Lois / index : réindexer en local (`model/scripts/ingest.sh`), puis
  `./deploy/sync-model.sh …` et `docker compose restart api` sur le VPS.

## Bon à savoir

- Le premier démarrage télécharge les modèles d'embedding (~1–2 Go), conservés
  ensuite dans le volume `hf_cache`.
- L'API tourne avec **1 worker** : les modèles de recherche sont chargés en mémoire.
- PostgreSQL n'est pas exposé à l'extérieur : seule l'API y accède.
- Les fichiers déposés par les utilisateurs sont dans le volume `uploads` : à
  sauvegarder avec la base (`docker compose exec db pg_dump …`).

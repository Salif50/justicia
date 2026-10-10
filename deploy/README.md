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
├── deploy.sh                 (Mac) déployer / mettre à jour le VPS en une commande
├── setup-vps.sh              préparer un VPS Ubuntu neuf (appelé par deploy.sh)
├── init-env.sh               créer le .env de production (appelé par deploy.sh)
├── backup.sh                 sauvegarder base + fichiers déposés
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

Premier démarrage : l'API télécharge ~2,5 Go de modèles d'embedding puis les
charge en mémoire (préchauffage au démarrage). Sur une connexion lente, copiez plutôt ceux déjà présents sur le Mac :
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

## Sur le VPS (production)

Guide complet (sous-domaines Hostinger, Vercel, Google, vérifications, dépannage) :
**[docs/DOMAINE_ET_DEPLOIEMENT.md](../docs/DOMAINE_ET_DEPLOIEMENT.md)**.

Production : API `https://justiciaapi.mosagix.com` (ce VPS) · site
`https://justicia.mosagix.com` (Vercel). Une fois le DNS créé, tout se fait depuis le Mac :

```bash
./deploy/deploy.sh root@IP_DU_VPS --admin    # 1re fois (+ compte administrateur)
./deploy/deploy.sh root@IP_DU_VPS            # chaque mise à jour (code, lois, index)
```

`deploy.sh` installe la clé SSH, prépare le serveur (`setup-vps.sh`), envoie
`backend/`, `deploy/` et `model/`, crée le `.env` de production (`init-env.sh`, secrets
générés sur le serveur), lance `up.sh`, programme `backup.sh` à 3 h et vérifie HTTPS.
Rien n'est à faire à la main sur le serveur. Les données (`.env`, base, fichiers
déposés, sauvegardes) ne sont jamais écrasées par une mise à jour.

Minimum : 4 vCPU, 8 Go de RAM, 40 Go de disque. Les réponses sont rédigées par
OpenAI : pas de GPU ni d'Ollama sur le VPS.

## Bon à savoir

- Le premier démarrage télécharge les modèles d'embedding (~2,6 Go), conservés
  ensuite dans le volume `hf_cache`.
- L'API tourne avec **1 worker** : les modèles de recherche sont chargés en mémoire.
- PostgreSQL n'est pas exposé à l'extérieur : seule l'API y accède.
- Les fichiers déposés par les utilisateurs sont dans le volume `uploads` : à
  sauvegarder avec la base (`docker compose exec db pg_dump …`).

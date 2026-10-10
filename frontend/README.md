# JusticIA — Frontend (Angular 20)

Application web : site public, espace client et administration.

```bash
npm install
npm start          # http://localhost:4200 — API attendue sur http://localhost:8000
```

- `src/app/pages/` — une page par dossier (public, espace client `/dashboard`, admin `/admin`)
- `src/app/layouts/` — shells de l'espace client et de l'administration
- `src/styles.scss` — design system : tokens de couleur et classes `app-*` partagées
- `src/environments/` — URL de l'API (`environment.ts` en dev, `environment.prod.ts` en prod)

## Déploiement sur Vercel

1. Vercel → **Add New Project** → importer le dépôt, **Root Directory : `frontend`**.
   `vercel.json` fournit déjà la commande de build, le dossier de sortie
   (`dist/justicIA/browser`) et la redirection de toutes les routes vers `index.html`.
2. **Environment Variables** :

   | Variable           | Exemple                          |
   |--------------------|----------------------------------|
   | `API_URL`          | `https://api.votre-domaine.com`  |
   | `GOOGLE_CLIENT_ID` | (facultatif, sinon valeur actuelle) |

   Au build, `scripts/set-env.mjs` écrit ces valeurs dans `environment.prod.ts`.
   L'API doit être en **HTTPS** : un site Vercel ne peut pas appeler une API en HTTP.
3. Après le premier déploiement, reporter l'URL Vercel côté backend
   (`FRONTEND_URL` et `CORS_ORIGINS` dans `deploy/.env`) et dans Google Cloud
   Console (« Origines JavaScript autorisées » de l'identifiant OAuth).

Tester le build de production en local :

```bash
npm run build:vercel     # sortie dans dist/justicIA/browser
```

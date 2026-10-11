# Mise en production : sous-domaines, VPS et Vercel

| Rôle | Adresse | Hébergement |
|---|---|---|
| Site (frontend Angular) | **https://justicia.mosagix.com** | Vercel |
| API (backend + moteur IA) | **https://justiciaapi.mosagix.com** | VPS Hostinger KVM 4 (Docker) |

Le domaine `mosagix.com` est déjà chez Hostinger : il suffit d'y créer **deux
sous-domaines** (deux enregistrements DNS). Tout le reste est déjà configuré dans le
code : URL de l'API dans le front, CORS, HTTPS, sécurité.

Ordre conseillé (le DNS met parfois du temps à se propager, on le fait donc en premier) :

1. [Récupérer l'IP du VPS](#1-récupérer-lip-du-vps)
2. [Créer les deux sous-domaines dans Hostinger](#2-créer-les-sous-domaines-dans-hostinger)
3. [Brancher le domaine sur Vercel](#3-vercel--frontend-sur-justiciamosagixcom)
4. [Déployer le backend (une commande)](#4-déployer-le-backend--une-commande)
5. [Google et paiement](#5-google-et-paiement)
6. [Vérifier](#6-vérifications)

---

## 1. Récupérer l'IP du VPS

hPanel → **VPS** → votre serveur KVM 4 → **Vue d'ensemble** : noter l'**adresse IPv4**
(ex. `82.180.x.x`) et le **mot de passe root** (modifiable dans *Paramètres*).

> Pare-feu Hostinger : hPanel → VPS → **Sécurité → Pare-feu**. Par défaut il n'y a
> aucune règle, donc rien à faire. Si vous en créez une, autorisez **TCP 22, 80, 443**
> (et UDP 443). Le serveur a de toute façon son propre pare-feu, installé par le script.

## 2. Créer les sous-domaines dans Hostinger

hPanel → **Domaines** → `mosagix.com` → **DNS / Serveurs de noms** → onglet
**Enregistrements DNS**. Ajouter :

| Type | Nom | Pointe vers / Cible | TTL |
|---|---|---|---|
| `A` | `justiciaapi` | IPv4 du VPS (étape 1) | 300 |
| `CNAME` | `justicia` | valeur donnée par Vercel à l'étape 3 (en général `cname.vercel-dns.com`) | 300 |

Dans le champ *Nom*, n'écrivez que `justiciaapi` ou `justicia`, pas le domaine complet :
Hostinger ajoute lui-même `.mosagix.com`.

Points à vérifier dans la même liste :

- **Pas de doublon** : s'il existe déjà un enregistrement `justicia` ou `justiciaapi`
  (A, AAAA ou CNAME), supprimez-le.
- **Pas d'`AAAA` pour `justiciaapi`**, sauf s'il pointe vers l'IPv6 réelle du VPS. Un
  AAAA erroné empêche l'obtention du certificat HTTPS.
- **CAA** : s'il existe des enregistrements `CAA` sur `mosagix.com`, ajoutez
  `CAA  @  0 issue "letsencrypt.org"`. S'il n'y en a aucun, ne rien faire.
- **Serveurs de noms** : l'onglet doit indiquer ceux de Hostinger
  (`ns1.dns-parking.com`, `ns2.dns-parking.com`). Si `mosagix.com` utilise d'autres
  serveurs de noms (Cloudflare…), créez les deux enregistrements **là-bas** et non
  dans Hostinger.

Vérifier depuis le Mac (de quelques minutes à quelques heures après l'ajout) :

```bash
dig +short justiciaapi.mosagix.com     # doit afficher l'IP du VPS
dig +short justicia.mosagix.com        # doit afficher un nom vercel-dns…
```

## 3. Vercel : frontend sur justicia.mosagix.com

1. **Importer le projet** (si ce n'est pas déjà fait) : vercel.com → *Add New → Project*
   → dépôt GitHub `Salif50/justicia`.
   - **Root Directory** : `frontend`
   - *Framework Preset* : laisser *Other*. `frontend/vercel.json` fournit déjà la
     commande de build, le dossier de sortie, le routage Angular et les en-têtes
     de sécurité.
2. **Variables d'environnement** (*Settings → Environment Variables*, environnement
   *Production*). Elles sont **obligatoires** : aucune valeur n'est écrite en dur dans le
   code, et le build échoue avec un message clair si l'une d'elles manque ou est invalide.
   - `API_URL` = `https://justiciaapi.mosagix.com` (sans `/api`, ajouté automatiquement)
   - `GOOGLE_CLIENT_ID` = l'identifiant du client OAuth « Web » (`…apps.googleusercontent.com`)
3. **Domaine** : *Settings → Domains → Add* → `justicia.mosagix.com`.
   Vercel affiche la cible CNAME exacte : c'est elle qu'il faut mettre dans Hostinger
   (étape 2). Attendre que Vercel indique **Valid Configuration**. Le certificat HTTPS
   est automatique.
4. **Redéployer** (*Deployments → … → Redeploy*) après toute modification des variables :
   elles sont intégrées au moment du build.

## 4. Déployer le backend : une commande

Depuis le Mac, à la racine du projet :

```bash
./deploy/deploy.sh root@IP_DU_VPS --admin
```

Le script fait tout, sans connexion manuelle au serveur :

| Étape | Ce qui se passe |
|---|---|
| Accès SSH | Installe votre clé SSH sur le VPS. Le **mot de passe root** est demandé **une seule fois**. |
| Clé OpenAI | Propose de réutiliser celle de votre configuration locale, ou vous la demande (saisie masquée). |
| Préparation | Mises à jour, mises à jour de sécurité automatiques, Docker, pare-feu (22/80/443), fail2ban, swap 4 Go, rotation des logs, utilisateur `deploy`, **SSH par clé uniquement**. |
| Code | Envoie `backend/`, `deploy/` et `model/` (index ChromaDB compris) dans `/opt/justicia`. |
| Configuration | Crée `deploy/.env` de production : mot de passe PostgreSQL et `SECRET_KEY` **générés sur le serveur**, domaines `mosagix.com` préremplis. |
| Démarrage | Construit l'image et lance PostgreSQL, l'API et Caddy, qui obtient seul le certificat HTTPS. |
| Sauvegardes | Programme une sauvegarde tous les jours à 3 h (base + fichiers, 14 jours conservés). |
| Vérification | Attend que les modèles soient chargés, puis teste `https://justiciaapi.mosagix.com/health`. |
| `--admin` | Crée le compte administrateur (e-mail, nom, mot de passe demandés). |

Premier déploiement : **10 à 15 minutes** (construction de l'image, puis
téléchargement d'environ 2,6 Go de modèles).

**Mettre à jour** plus tard (code backend, lois, index) : relancer simplement
`./deploy/deploy.sh root@IP_DU_VPS`. Les secrets, la base, les fichiers déposés et les
sauvegardes ne sont jamais écrasés.

> ⚠️ Une fois le déploiement fait, **la connexion par mot de passe est désactivée** :
> seule la clé SSH de ce Mac (`~/.ssh/id_ed25519`) donne accès au serveur.
> Sauvegardez-la. En cas de perte, il reste la **console du navigateur** dans hPanel
> (VPS → *Accès console*).

## 5. Google et paiement

- **Connexion Google** : [console.cloud.google.com](https://console.cloud.google.com) →
  *API et services → Identifiants* → client OAuth « Web » → **Origines JavaScript
  autorisées** → ajouter `https://justicia.mosagix.com`. Aucune URI de redirection
  n'est nécessaire (mode popup). La prise en compte peut prendre quelques minutes.
- **Paiement Mosagix Pay** : voir la section [Mosagix Pay](#mosagix-pay) ci-dessous.
- **E-mails** : désactivés tant que `EMAILS_ENABLED=false`. Pour les activer, renseigner
  les variables `SMTP_*` dans le même `.env`, puis lancer `./up.sh`.

### Mosagix Pay

**À déclarer chez Mosagix Pay** (espace marchand) :

| Réglage | Valeur |
|---|---|
| URL de webhook | `https://justiciaapi.mosagix.com/api/webhooks/mosagix` |
| Événements | `payment.success`, `payment.failed`, `payment.cancelled`, `payment.timeout` |
| Domaine de retour (si demandé) | `https://justicia.mosagix.com` |

Il n'y a pas besoin de déclarer les pages de retour : JusticIA les envoie à chaque
paiement.
- succès : `https://justicia.mosagix.com/dashboard/subscription/payment/success`
- annulation : `https://justicia.mosagix.com/dashboard/subscription/payment/cancel`

Moyens de paiement proposés : `OM` (Orange Money), `MOMO` (MTN MoMo), `PAYCARD`, `CARD`.
Pays `GN`, devise `GNF`.

**À recopier depuis Mosagix Pay dans `/opt/justicia/deploy/.env`** :

| Variable | Contenu |
|---|---|
| `MOSAGIX_API_URL` | Adresse de base de l'API Mosagix Pay, en `https://`, **sans** `/api/v1` (JusticIA ajoute `/api/v1/checkout`, `/api/v1/payments/…`, `/api/v1/status`). |
| `MOSAGIX_API_KEY` | Clé API marchande (secrète), envoyée dans l'en-tête `X-Mosagix-Key`. |
| `MOSAGIX_WEBHOOK_SECRET` | Secret de signature des webhooks (secret), différent de la clé API. |

Ce que fait le backend avec ces valeurs :
- **Signature des webhooks** : en-tête `X-Mosagix-Signature: v1:<HMAC-SHA256 hexadécimal
  du corps brut, calculé avec MOSAGIX_WEBHOOK_SECRET>`. Sans signature valide, la
  réponse est **401**.
- **Contrôle du lien de paiement** : la page de paiement renvoyée par Mosagix
  (`checkoutUrl`) doit être sur le **même nom de domaine** que `MOSAGIX_API_URL`.
  C'est une protection contre les redirections frauduleuses. Si Mosagix héberge sa page
  de paiement sur un autre domaine que son API, signalez-le : le contrôle devra être
  adapté.

Appliquer, sur le VPS :

```bash
cd /opt/justicia/deploy
nano .env        # remplir les 3 variables MOSAGIX_*
./up.sh          # recrée l'API avec la nouvelle configuration
```

Vérifier : un abonnement payant ouvre la page Mosagix, et après paiement la page
« succès » active le plan. Le webhook confirme aussi le paiement si l'utilisateur ferme
la page avant le retour.

### E-mails : confirmation d'inscription, mot de passe oublié, factures

Tant que `EMAILS_ENABLED=false`, rien n'est envoyé. Dans ce cas, l'inscription par
formulaire ne demande **pas** de confirmation : sans e-mail, personne ne pourrait
confirmer son adresse. Dès que les e-mails sont activés :

- toute **inscription par formulaire** doit être confirmée par un lien (valable 48 h)
  avant la première connexion. Les comptes Google sont déjà vérifiés par Google ;
- **Mot de passe oublié** envoie un lien à usage unique, valable 1 h ;
- chaque **paiement** envoie la facture PDF (numéro `JST-AAAA-000001`) par e-mail. Elle
  reste aussi téléchargeable dans *Abonnement*.

Les comptes créés avant le 11 octobre 2026 sont considérés comme confirmés. Un compte
créé ensuite sans confirmation pourra demander un nouveau lien depuis la page de
connexion.

**1. Créer la boîte d'envoi** : hPanel → **E-mails** → `mosagix.com` → créer par
exemple `no-reply@mosagix.com`. Comme le DNS du domaine est chez Hostinger, les
enregistrements MX, SPF et DKIM sont ajoutés automatiquement. Vérifiez qu'ils
apparaissent dans *DNS* : sans eux, les messages arrivent en indésirables.

**2. Ajouter ces lignes** dans `/opt/justicia/deploy/.env` (sur le VPS, `nano .env`) :

```
EMAILS_ENABLED=true
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=no-reply@mosagix.com
SMTP_PASSWORD=mot-de-passe-de-la-boite
EMAILS_FROM_NAME=JusticIA
```

**3. Facultatif : mentions légales des factures** (vide = non imprimé, rien n'est inventé) :

```
INVOICE_SELLER_NAME=Nom légal de la société
INVOICE_SELLER_ADDRESS=Adresse, Conakry
INVOICE_SELLER_TAX_ID=NIF / RCCM
INVOICE_SELLER_EMAIL=contact@mosagix.com
```

**4. Appliquer** : `./up.sh`. Testez ensuite en créant un compte avec une adresse
personnelle.

### Anti-robots : Cloudflare Turnstile (facultatif)

Les formulaires d'inscription et de contact sont déjà protégés sans rien configurer :
- un champ piège invisible ;
- un délai minimal de remplissage ;
- des limites par adresse IP et par compte (8 mots de passe erronés en 15 min bloquent
  le compte pour 15 min).

Pour ajouter la case anti-robot de Cloudflare, gratuite et sans puzzle d'images :

1. [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → *Add widget*, domaine
   `justicia.mosagix.com`, mode *Managed*.
2. Dans **Vercel**, ajoutez `TURNSTILE_SITE_KEY` = la clé de site, puis redéployez.
3. Sur le **VPS**, ajoutez `TURNSTILE_SECRET_KEY=` la clé secrète dans `.env`, puis `./up.sh`.

Configurez les deux clés en même temps : avec la clé secrète seule, le serveur exige une
vérification que le site n'affiche pas.

## 6. Vérifications

```bash
curl https://justiciaapi.mosagix.com/health
# → "env":"production", "rag":{"ready":true,"loaded":true}
```

Dans le navigateur, sur https://justicia.mosagix.com :

- [ ] le cadenas HTTPS est présent sur le site et sur l'API ;
- [ ] la page **Tarifs** affiche les offres, ce qui prouve que le front joint l'API ;
- [ ] inscription, connexion par e-mail, connexion Google ;
- [ ] une question dans le chat obtient une réponse avec ses sources ;
- [ ] `https://justiciaapi.mosagix.com/docs` répond **404** (documentation masquée en production).

## Sécurité en place

**Serveur**
- Pare-feu : seuls 22, 80 et 443 sont ouverts.
- SSH par clé uniquement ; fail2ban contre les attaques par force brute.
- Mises à jour de sécurité Ubuntu automatiques.

**Réseau**
- HTTPS obligatoire (Let's Encrypt, renouvelé automatiquement) avec HSTS.
- PostgreSQL n'est **jamais** exposé ; l'API n'écoute que derrière Caddy.

**API**
- CORS limité à `https://justicia.mosagix.com`.
- Documentation `/docs` masquée en production.
- Taille des envois limitée (60 Mo).
- Limitation du nombre de requêtes par visiteur, sur sa vraie IP.
- En-têtes anti-clickjacking, anti-sniffing et CSP.

**Comptes**
- Inscription par formulaire confirmée par e-mail (si les e-mails sont activés).
- Jetons de session typés : un jeton de rafraîchissement ne peut pas servir d'accès, et
  un lien reçu par e-mail ne peut jamais servir de session.
- Formulaires publics protégés contre les robots (champ piège, délai, limites, Turnstile
  en option). Les messages ne révèlent jamais si une adresse a déjà un compte.

**Garde-fous de configuration** — l'API **refuse de démarrer** en production si :
- `SECRET_KEY` est faible ou laissée par défaut ;
- le mot de passe de la base est celui par défaut ;
- une URL n'est pas en HTTPS ;
- `GOOGLE_CLIENT_ID` est absent.

**Secrets**
- `deploy/.env` est en droits 600, générés sur le serveur, jamais dans Git.

**Conteneurs**
- `no-new-privileges` ; moteur IA monté en lecture seule (sauf l'index).

**Site**
- En-têtes de sécurité Vercel : HSTS, anti-iframe, Permissions-Policy.

## Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `https://justiciaapi…` ne répond pas, mais `deploy.sh` dit « API démarrée » | DNS pas encore propagé, ou enregistrement A erroné | `dig +short justiciaapi.mosagix.com`. Caddy réessaie seul une fois le DNS correct. |
| Logs Caddy : erreur de certificat | AAAA ou CAA bloquant, port 80 fermé | Voir l'étape 2 ; pare-feu hPanel. Logs : `docker compose logs caddy` |
| Le site affiche « service momentanément indisponible » | API arrêtée ou en cours de démarrage | `ssh root@IP 'cd /opt/justicia/deploy && docker compose ps && docker compose logs --tail 80 api'` |
| Erreur CORS dans la console du navigateur | Le site est ouvert depuis une autre adresse (ex. `*.vercel.app`) | Utiliser `https://justicia.mosagix.com`, ou ajouter l'adresse dans `CORS_ORIGINS` (séparées par des virgules) puis `./up.sh` |
| L'API refuse de démarrer : « Configuration de production non sûre » | Un garde-fou de sécurité | Le message liste la ligne de `.env` à corriger |
| Connexion Google refusée | Origine non autorisée | Étape 5 |

Commandes utiles sur le VPS (`ssh root@IP`, puis `cd /opt/justicia/deploy`) :

| Action | Commande |
|---|---|
| État des services | `docker compose ps` |
| Logs de l'API | `docker compose logs -f api` |
| Redémarrer l'API | `./restart.sh` |
| Appliquer une modification de `.env` | `./up.sh` (`restart.sh` ne relit **pas** le `.env`) |
| Sauvegarde manuelle | `./backup.sh` |
| Restaurer une sauvegarde | voir la fin de `deploy/backup.sh` |

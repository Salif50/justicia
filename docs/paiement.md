# Prompt agent IA — Intégrer Mosagix Pay

> **Usage :** copie-colle ce document entier dans ton agent (Cursor, Claude, etc.) en remplaçant le bloc `{{VARIABLES}}`.  
> L’agent doit intégrer **Mosagix Pay** comme **seul** moyen de paiement. Ne jamais appeler Djomy directement.  
> **Contrat API :** août 2026 · hub `pay.mosagix.com`

---

## RÔLE

Tu es un ingénieur senior chargé d’intégrer **Mosagix Pay** dans l’application SaaS ci-dessous.

Objectifs :
1. Permettre à un utilisateur de payer via Mosagix (checkout → page Mosagix → prestataire → retour **automatique**)
2. Confirmer le paiement de façon **fiable** (webhook signé + vérification API)
3. Ne jamais livrer un service / activer un abonnement sur la seule redirection navigateur
4. Respecter strictement le contrat API décrit ici (éviter 400 / 401 / 403 / 503)

---

## CONTEXTE PRODUIT

Mosagix Pay est un hub de paiement centralisé. Chaque SaaS Mosagix (Sellix, Restora, AgriHubX, …) :

1. Appelle `POST /api/v1/checkout` avec sa clé API (**serveur uniquement**)
2. Redirige l’utilisateur vers `checkoutUrl` (page Mosagix `/pay/:token`)
3. Mosagix gère le paiement chez le prestataire (Djomy) — **invisible pour le SaaS**
4. Après confirmation :
   - Mosagix **redirige automatiquement** le navigateur vers `successUrl` ou `cancelUrl` (aucun clic utilisateur requis sur Mosagix)
   - Mosagix notifie le SaaS via **webhook signé** (source de vérité)

```
[SaaS serveur] --POST /checkout + X-Mosagix-Key--> [Mosagix API]
[SaaS] <-- checkoutUrl ---
[Browser] --> Mosagix /pay/:token --> portail prestataire
[Prestataire] --> Mosagix (webhook + return)
[Mosagix] --302 auto--> successUrl | cancelUrl (+ query params)
[Mosagix] --POST webhook signé--> [SaaS webhookUrl]
```

⚠️ La page `successUrl` sert à l’**UX**. Le **fulfillment** (activer abonnement, créditer wallet, livrer commande) se fait via **webhook** et/ou `GET /payments/:id`.

---

## {{VARIABLES À REMPLIR AVANT DE LANCER L’AGENT}}

⚠️ **Ne confonds pas les deux sens du flux.** Certaines valeurs viennent **de Mosagix vers toi** (tu les reçois, tu ne les inventes pas). D’autres viennent **de toi vers Mosagix** (c’est TON app qui les définit, et c’est TOI qui les communique à Mosagix via `/zadmin` — jamais l’inverse). Les mélanger est la cause n°1 de confusion en intégration.

### 1. Fournies PAR Mosagix (tu les reçois, ne les invente pas)

Obtenues sur le portail admin Mosagix (`/zadmin`) après enregistrement de ton app :

```
MOSAGIX_API_URL=          # local: http://localhost:4000 | prod: https://pay.mosagix.com
MOSAGIX_API_KEY=          # msk_… (jamais dans le front public)
MOSAGIX_WEBHOOK_SECRET=   # whsec_… (jamais dans le front)
```

### 2. Définies PAR TOI (ton app) — À COMMUNIQUER à Mosagix, pas l’inverse

Ce sont les infos de **ton** app que **tu** dois fournir à Mosagix (dans `/zadmin`, en enregistrant `webhookUrl` + domaines autorisés). Mosagix ne te les donne jamais — c’est toi qui les choisis.

```
APP_NAME=                 # ex: Sellix / Restora / AgriHubX
APP_SLUG=                 # ex: sellix / restora / agrihubx
APP_DOMAIN_PROD=          # ex: selix.app
APP_DOMAINS_ALLOWED=      # ex: selix.app, localhost, 127.0.0.1
SAAS_WEBHOOK_PATH=        # ex: /api/webhooks/mosagix (route sur TON backend qui reçoit le webhook)
SAAS_SUCCESS_PATH=        # ex: /billing/success
SAAS_CANCEL_PATH=         # ex: /billing/cancel

# URL publique de TON backend, pour construire le webhookUrl à déclarer dans /zadmin.
#   local : un tunnel (ex. ngrok) — Mosagix est un serveur EXTERNE qui t’appelle en POST,
#           il ne peut pas atteindre ton localhost.
#   prod  : ton vrai domaine backend HTTPS (ex. https://api.selix.app)
# ⚠️ Ne préfixe PAS cette variable par "MOSAGIX_" dans ton code — c’est TON URL, pas la sienne.
#    Nomme-la selon ta propre convention (ex. APP_PUBLIC_BACKEND_URL, BACKEND_PUBLIC_URL…).
APP_PUBLIC_BACKEND_URL=

# URL publique de TON frontend, pour construire successUrl / cancelUrl.
#   local : http://localhost:xxxx suffit SI tu testes depuis ton propre navigateur
#           (déclare "localhost" dans les domaines autorisés /zadmin).
#           Utilise un tunnel seulement si tu testes un paiement réel depuis un téléphone
#           (OM/MOMO) : le téléphone doit pouvoir atteindre cette URL au retour.
#   prod  : ton vrai domaine frontend HTTPS (ex. https://selix.app)
# ⚠️ Même remarque : pas de préfixe "MOSAGIX_", c’est TON URL.
APP_PUBLIC_FRONTEND_URL=

DEFAULT_COUNTRY=GN
DEFAULT_CURRENCY=GNF
STACK=                    # ex: Next.js / Nest / Laravel / Flutter web…
```

**Résumé du sens des flux :**
- `MOSAGIX_API_URL` / `MOSAGIX_API_KEY` / `MOSAGIX_WEBHOOK_SECRET` → Mosagix **te les donne**.
- `APP_PUBLIC_BACKEND_URL` + `SAAS_WEBHOOK_PATH` → tu les combines pour obtenir `webhookUrl`, et **c’est toi qui l’enregistres** dans `/zadmin` (Mosagix ne le devine pas).
- `APP_PUBLIC_FRONTEND_URL` + `SAAS_SUCCESS_PATH`/`SAAS_CANCEL_PATH` → idem, tu les combines et déclares les domaines dans `/zadmin`.

---

## RÈGLES NON NÉGOCIABLES (sécurité)

1. **`MOSAGIX_API_KEY` et `MOSAGIX_WEBHOOK_SECRET` uniquement côté serveur** (env / secrets). Jamais dans le bundle client, Git public, ou logs.
2. Mosagix n’accepte le checkout que si :
   - la clé `X-Mosagix-Key` correspond à une app **enregistrée et active**
   - `successUrl` / `cancelUrl` pointent vers un **domaine autorisé** de cette app
3. **`metadata` est optionnel.** Ne pas le rendre obligatoire. Si tu l’utilises : objet **plat** uniquement (pas de nested, pas d’arrays), max 20 clés, valeurs string|number|boolean.
4. **Ne jamais fulfill** uniquement parce que l’utilisateur est arrivé sur `successUrl`.
5. Fulfillment uniquement si :
   - webhook `eventType === "payment.success"` **et** signature valide, **ou**
   - `GET /api/v1/payments/:id` retourne `status === "SUCCESS"`
6. Répondre **HTTP 200** rapidement au webhook (traitement async OK). Idempotence stricte.
7. Avant d’ouvrir un checkout, appeler `GET /api/v1/status` : si `available !== true`, afficher le `message` et bloquer le paiement.
8. Téléphone payeur au format international strict : `00` + indicatif + numéro (ex: `00224623707722`).
9. `merchantPaymentReference` unique par commande. En-tête `Idempotency-Key` recommandé.
10. En production : `successUrl` / `cancelUrl` / `webhookUrl` en **HTTPS**.

---

## ENDPOINTS MOSAGIX

Base : `{{MOSAGIX_API_URL}}`

| Méthode | Path | Auth | Usage |
|---------|------|------|-------|
| `GET` | `/api/v1/status` | public | Disponibilité (maintenance / kill-switch) |
| `POST` | `/api/v1/checkout` | `X-Mosagix-Key` | Créer session + `checkoutUrl` |
| `GET` | `/api/v1/payments/:id` | `X-Mosagix-Key` | Statut (`id` = paymentId \| ref \| token) |
| Webhook entrant | `{{SAAS_WEBHOOK_PATH}}` | `X-Mosagix-Signature` | Mosagix → ton SaaS |

SDK npm optionnel : `@mosagix/pay`.

---

## ÉTAPE 1 — Variables d’environnement SaaS

```env
MOSAGIX_API_URL={{MOSAGIX_API_URL}}
MOSAGIX_API_KEY={{MOSAGIX_API_KEY}}
MOSAGIX_WEBHOOK_SECRET={{MOSAGIX_WEBHOOK_SECRET}}
```

Ne committe jamais les secrets.

---

## ÉTAPE 2 — Client checkout (serveur uniquement)

### Request

`POST {{MOSAGIX_API_URL}}/api/v1/checkout`

Headers :
- `Content-Type: application/json`
- `X-Mosagix-Key: {{MOSAGIX_API_KEY}}`
- `Idempotency-Key: {{unique-request-id}}` (recommandé)

Body (exemple) :

```json
{
  "amount": 50000,
  "countryCode": "GN",
  "currency": "GNF",
  "payerNumber": "00224623707722",
  "payerName": "Aïssatou Diallo",
  "description": "Abonnement Pro",
  "merchantPaymentReference": "ORD-2026-0042",
  "successUrl": "{{APP_PUBLIC_FRONTEND_URL}}{{SAAS_SUCCESS_PATH}}",
  "cancelUrl": "{{APP_PUBLIC_FRONTEND_URL}}{{SAAS_CANCEL_PATH}}",
  "metadata": {
    "user_id": "u_123",
    "plan": "pro"
  },
  "allowedPaymentMethods": ["OM", "MOMO", "PAYCARD", "CARD"]
}
```

| Champ | Obligatoire | Notes |
|-------|-------------|--------|
| `amount` | oui | Entier > 0 (unités monétaires, ex. GNF) |
| `payerNumber` | oui | `00…` |
| `merchantPaymentReference` | oui | Unique côté SaaS |
| `successUrl` / `cancelUrl` | oui | Domaine autorisé dans admin Mosagix |
| `countryCode` | non | Défaut `GN` |
| `currency` | non | Défaut `GNF` |
| `description` / `payerName` / `payerEmail` | non | — |
| `metadata` | non | Objet plat |
| `allowedPaymentMethods` | non | `OM`, `MOMO`, `SOUTRA_MONEY`, `PAYCARD`, `CARD` |

### Response 201

```json
{
  "success": true,
  "data": {
    "paymentId": "…",
    "checkoutToken": "…",
    "checkoutUrl": "https://…/pay/…",
    "status": "CREATED",
    "amount": 50000,
    "currency": "GNF",
    "merchantPaymentReference": "ORD-2026-0042",
    "idempotent": false
  }
}
```

**Action immédiate :** rediriger le navigateur vers `data.checkoutUrl` (302 / `window.location` / `res.redirect`).

### Idempotence

1. En-tête `Idempotency-Key` — Mosagix renvoie la même session si déjà créée.
2. Même `merchantPaymentReference` avec session encore `CREATED|REDIRECTED|PENDING` → session existante (`idempotent: true`). Réutilise `checkoutUrl`.

### Erreurs fréquentes

| HTTP | code | Cause typique | Correctif |
|------|------|---------------|-----------|
| 400 | `VALIDATION_ERROR` | téléphone / amount / ref invalides | Lire `fieldErrors` |
| 400 | `RETURN_URL_FORBIDDEN` | URL hors domaines autorisés | Ajouter le domaine dans `/zadmin` |
| 401 | `UNAUTHORIZED` | Mauvaise clé / app désactivée | Vérifier `MOSAGIX_API_KEY` |
| 429 | `RATE_LIMITED` | Trop d’appels | Backoff + `Retry-After` |
| 503 | `SERVICE_UNAVAILABLE` | Maintenance Mosagix | Afficher `message`, retry plus tard |

---

## ÉTAPE 3 — Pages success / cancel (UX seulement)

Après paiement, Mosagix **redirige automatiquement** (HTTP 302) vers tes URLs avec des query params.  
**Affiche un message**, puis confirme côté serveur (webhook ou `GET /payments/:id`).

### successUrl (exemple)

```
https://domaine/billing/success
  ?mosagix_payment_id=…
  &mosagix_ref=ORD-…
  &status=success
  &outcome=success
  &amount=50000
  &currency=GNF
  &paid_amount=50000
  &transaction_id=…
  &payment_method=OM
  &metadata=…          (si fourni)
  &meta_user_id=…      (clés plates meta_*)
```

### cancelUrl (exemple)

```
https://domaine/billing/cancel
  ?mosagix_payment_id=…
  &mosagix_ref=ORD-…
  &status=cancelled
  &outcome=cancel
  &amount=50000
  &currency=GNF
```

| Param | Description |
|-------|-------------|
| `outcome` | `success` \| `cancel` \| `pending` |
| `status` | statut brut minuscule |
| `mosagix_payment_id` | ID Mosagix |
| `mosagix_ref` | ta référence commande |
| `amount` / `currency` | montant demandé |
| `paid_amount` | montant payé (si dispo) |
| `transaction_id` | ID prestataire (si dispo) |
| `payment_method` | OM, MOMO, PAYCARD, … |
| `metadata` / `meta_*` | echo de tes metadata |

Sur la page success : appeler ton backend `POST /billing/confirm` qui fait `GET Mosagix /payments/:id` pour double-check si le webhook n’a pas encore abouti.

---

## ÉTAPE 4 — Webhook Mosagix → SaaS (fortement recommandé)

### Config admin Mosagix (`/zadmin`)

C'est TOI (l'app intégratrice) qui déclares ces valeurs dans `/zadmin` — Mosagix ne les devine pas :

- `webhookUrl` = `{{APP_PUBLIC_BACKEND_URL}}{{SAAS_WEBHOOK_PATH}}`
  - local : `{{APP_PUBLIC_BACKEND_URL}}` = ton tunnel ngrok (ex. `https://927c-….ngrok-free.app`)
  - prod : `{{APP_PUBLIC_BACKEND_URL}}` = `https://{{APP_DOMAIN_PROD}}`
- Domaines autorisés = `{{APP_DOMAINS_ALLOWED}}` (inclut `localhost` pour les tests locaux depuis ton navigateur)

### Headers reçus

- `Content-Type: application/json`
- `X-Mosagix-Signature: v1:<hex>`
- `X-Mosagix-App: {{APP_SLUG}}`
- `X-Mosagix-Event: payment.success|failed|cancelled|timeout`
- `X-Mosagix-Delivery: <deliveryId>`
- `X-Mosagix-Attempt: <n>`

### Vérification signature (obligatoire)

```ts
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyMosagixWebhook(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string
): boolean {
  if (!signatureHeader?.startsWith("v1:")) return false;
  const provided = signatureHeader.slice(3);
  const expected = createHmac("sha256", secret)
    .update(typeof rawBody === "string" ? rawBody : rawBody)
    .digest("hex");
  try {
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
```

⚠️ Utilise le **raw body** (bytes/string bruts), pas un JSON re-sérialisé.

### Payload

```json
{
  "eventType": "payment.success",
  "paymentId": "…",
  "merchantPaymentReference": "ORD-2026-0042",
  "amount": 50000,
  "paidAmount": 50000,
  "receivedAmount": 48000,
  "fees": 2000,
  "currency": "GNF",
  "countryCode": "GN",
  "paymentMethod": "OM",
  "djomyTransactionId": "…",
  "status": "SUCCESS",
  "metadata": { "user_id": "u_123", "plan": "pro" },
  "completedAt": "…",
  "createdAt": "…"
}
```

### Logique webhook

```
1. Lire rawBody
2. verifyMosagixWebhook(rawBody, header, MOSAGIX_WEBHOOK_SECRET) sinon 401
3. Parser JSON
4. Idempotence : si paymentId / merchantPaymentReference déjà traité SUCCESS → 200
5. switch eventType:
   - payment.success → activer commande / abonnement (transaction DB)
   - payment.failed | cancelled | timeout → marquer échec / libérer stock
6. Répondre 200 immédiatement
```

Mosagix retente automatiquement les webhooks en échec (jusqu’à 8 fois). Ton handler doit rester idempotent.

---

## ÉTAPE 5 — Vérification API (filet de sécurité)

`GET {{MOSAGIX_API_URL}}/api/v1/payments/{{mosagix_payment_id|mosagix_ref|checkoutToken}}`  
Header : `X-Mosagix-Key: {{MOSAGIX_API_KEY}}`

N’active le service que si `data.status === "SUCCESS"`.

Champ utile : `merchantNotifyStatus` (`NONE|PENDING|DELIVERED|FAILED|SKIPPED`).

---

## ÉTAPE 6 — Disponibilité

```http
GET {{MOSAGIX_API_URL}}/api/v1/status
```

```json
{
  "success": true,
  "data": {
    "available": true,
    "message": null,
    "sandbox": true
  }
}
```

Si `available === false` → UI : afficher `data.message` (ex. « Paiements temporairement indisponibles »).

---

## RÉCONCILIATION (argent capturé, SaaS non notifié)

Cas critique : le payeur a été débité, Mosagix a `status=SUCCESS`, mais ton webhook était down.

Mosagix gère déjà :
- retries automatiques
- panneau admin « À risque » + renvoi manuel
- headers `X-Mosagix-Delivery` / `X-Mosagix-Attempt`

Côté SaaS :

1. **Idempotence stricte** sur `merchantPaymentReference` / `paymentId`
2. Sur `successUrl`, re-vérifier via `GET /api/v1/payments/:id` → fulfill si `SUCCESS` et pas encore activé
3. Job périodique (optionnel) pour les commandes `pending_payment` trop anciennes
4. Ne jamais ignorer un webhook en erreur sans log + alerte

---

## PLAN D’IMPLÉMENTATION POUR L’AGENT

Exécute dans cet ordre, en adaptant au `{{STACK}}` :

1. **Env** : 3 variables Mosagix
2. **Module `mosagix/`** :
   - `getStatus()`
   - `createCheckout(input)` (+ `Idempotency-Key`)
   - `getPayment(id)`
   - `verifyWebhook(rawBody, signature)`
3. **Endpoint serveur** `POST /api/billing/checkout` (ou équivalent) :
   - auth utilisateur SaaS
   - valider amount + téléphone `00…`
   - créer `merchantPaymentReference` unique
   - appeler Mosagix checkout
   - renvoyer `checkoutUrl` **ou** rediriger
4. **Route webhook** `{{SAAS_WEBHOOK_PATH}}` :
   - raw body + verify signature
   - fulfill idempotent sur `payment.success`
5. **Pages** `{{SAAS_SUCCESS_PATH}}` et `{{SAAS_CANCEL_PATH}}` :
   - message UX depuis query params
   - confirm serveur si besoin
6. **Tests manuels** :
   - checkout OK → redirect Mosagix
   - paiement OK → retour **auto** sur successUrl avec params
   - webhook signature invalide → 401
   - webhook success → commande activée **une seule fois**
   - mauvaise return URL → 400 `RETURN_URL_FORBIDDEN`
   - `/api/v1/status` unavailable → UI bloquée
7. **Ne pas** :
   - exposer la clé API au front
   - appeler Djomy
   - exiger metadata
   - fulfill sur redirect seul

---

## SNIPPET TYPESCRIPT COMPLET (référence)

```ts
const MOSAGIX_API = process.env.MOSAGIX_API_URL!;
const MOSAGIX_KEY = process.env.MOSAGIX_API_KEY!;
const MOSAGIX_WHSEC = process.env.MOSAGIX_WEBHOOK_SECRET!;

export async function mosagixAvailable() {
  const res = await fetch(`${MOSAGIX_API}/api/v1/status`);
  const json = await res.json();
  return Boolean(json?.data?.available);
}

export async function createMosagixCheckout(input: {
  amount: number;
  payerNumber: string;
  merchantPaymentReference: string;
  successUrl: string;
  cancelUrl: string;
  description?: string;
  payerName?: string;
  metadata?: Record<string, string | number | boolean>;
  allowedPaymentMethods?: Array<"OM" | "MOMO" | "SOUTRA_MONEY" | "PAYCARD" | "CARD">;
  idempotencyKey?: string;
}) {
  if (!(await mosagixAvailable())) {
    throw new Error("Mosagix indisponible");
  }

  const { idempotencyKey, ...body } = input;
  const res = await fetch(`${MOSAGIX_API}/api/v1/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Mosagix-Key": MOSAGIX_KEY,
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
    },
    body: JSON.stringify({
      countryCode: "GN",
      currency: "GNF",
      ...body,
    }),
  });

  const json = await res.json();
  if (!res.ok || !json.success) {
    throw Object.assign(new Error(json.message ?? "Checkout failed"), {
      status: res.status,
      code: json.code,
      fieldErrors: json.fieldErrors,
    });
  }

  return json.data as {
    paymentId: string;
    checkoutUrl: string;
    merchantPaymentReference: string;
    idempotent?: boolean;
  };
}

export async function getMosagixPayment(id: string) {
  const res = await fetch(`${MOSAGIX_API}/api/v1/payments/${encodeURIComponent(id)}`, {
    headers: { "X-Mosagix-Key": MOSAGIX_KEY },
  });
  const json = await res.json();
  if (!res.ok || !json.success) throw new Error(json.message ?? "Payment lookup failed");
  return json.data as {
    status: string;
    merchantPaymentReference: string;
    amount: number;
    merchantNotifyStatus?: string;
  };
}
```

Ou via SDK :

```ts
import { MosagixPay } from "@mosagix/pay";

const pay = new MosagixPay({
  baseUrl: process.env.MOSAGIX_API_URL!,
  apiKey: process.env.MOSAGIX_API_KEY!,
});

const session = await pay.createCheckout({ /* … */ });
// window.location = session.checkoutUrl

const ok = MosagixPay.verifyWebhook(rawBody, signatureHeader, process.env.MOSAGIX_WEBHOOK_SECRET!);
```

---

## CHECKLIST FINALE (l’agent doit cocher)

- [ ] Secrets uniquement serveur
- [ ] Checkout via Mosagix uniquement (pas Djomy)
- [ ] Redirect navigateur vers `checkoutUrl`
- [ ] successUrl / cancelUrl sur domaines autorisés
- [ ] Webhook avec vérification HMAC `v1:` + raw body
- [ ] Fulfillment idempotent sur `payment.success` seulement
- [ ] Gestion failed / cancelled / timeout
- [ ] Check `/api/v1/status` avant paiement
- [ ] Téléphone format `00…`
- [ ] `Idempotency-Key` et/ou ref unique
- [ ] metadata optionnelle et plate si utilisée
- [ ] Pages success/cancel UX sans trust aveugle
- [ ] Domaines `localhost` déclarés dans admin Mosagix pour les tests locaux

---

## ANTI-PATTERNS

- Mettre `msk_…` dans React/Vue/Flutter client
- Considérer `outcome=success` dans l’URL comme preuve de paiement
- Re-sérialiser le body avant de vérifier la signature webhook
- Oublier l’idempotence webhook (double activation)
- Envoyer metadata nested (`{ user: { id: 1 } }`)
- Utiliser un numéro local sans préfixe `00`
- Pointer successUrl vers un domaine non enregistré dans admin Mosagix
- Appeler Djomy depuis le SaaS

---

## LIVRABLE ATTENDU DE L’AGENT

1. Code d’intégration compilant / démarrant
2. Routes checkout + webhook + pages return
3. Court README section « Paiements Mosagix » (env vars + flux)
4. Liste des fichiers créés/modifiés

Quand tu as fini, résume : endpoints ajoutés, variables d’env, et comment tester en local.

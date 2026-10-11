// Génère src/environments/environment.prod.ts à partir des variables d'environnement
// du build (Vercel → Settings → Environment Variables). Aucune valeur en dur dans le code.
//   API_URL           ex. https://justiciaapi.mosagix.com   (« /api » est ajouté si absent)
//   GOOGLE_CLIENT_ID  identifiant OAuth « Web » (…apps.googleusercontent.com)
//   TURNSTILE_SITE_KEY  (facultatif) clé de site Cloudflare Turnstile — anti-robots
// Sur Vercel (ou en CI), une variable manquante ou invalide fait échouer le build :
// mieux vaut un déploiement refusé qu'un site en ligne qui n'atteint pas l'API.
import { writeFileSync } from 'node:fs';

const strict = process.env.VERCEL === '1' || process.env.CI === 'true';
const errors = [];

let apiUrl = (process.env.API_URL ?? '').trim().replace(/\/+$/, '');
if (!apiUrl) errors.push('API_URL manquante (ex. https://justiciaapi.mosagix.com)');
else if (!apiUrl.startsWith('https://')) errors.push(`API_URL doit être en https:// (reçu : ${apiUrl})`);
if (apiUrl && !apiUrl.endsWith('/api')) apiUrl += '/api';

const googleClientId = (process.env.GOOGLE_CLIENT_ID ?? '').trim();
if (!googleClientId) errors.push('GOOGLE_CLIENT_ID manquant');
else if (!/^\d+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(googleClientId)) {
  errors.push(
    `GOOGLE_CLIENT_ID invalide : « ${googleClientId} ». Format attendu ` +
    '123456789012-xxxxxxxx.apps.googleusercontent.com (préfixe numérique compris, copier la valeur entière)',
  );
}

const turnstileSiteKey = (process.env.TURNSTILE_SITE_KEY ?? '').trim();

if (errors.length) {
  const msg = errors.map((e) => `  - ${e}`).join('\n');
  if (strict) {
    console.error(`✗ Variables d'environnement Vercel à corriger (Settings → Environment Variables) :\n${msg}`);
    process.exit(1);
  }
  console.warn(`⚠️  Build local sans variables de production :\n${msg}`);
}

writeFileSync(
  new URL('../src/environments/environment.prod.ts', import.meta.url),
  `// Généré au build par scripts/set-env.mjs depuis API_URL et GOOGLE_CLIENT_ID.
// Ne pas y écrire de valeurs : les définir dans Vercel → Settings → Environment Variables.
export const environment = {
  production: true,
  apiUrl: ${JSON.stringify(apiUrl)},
  googleClientId: ${JSON.stringify(googleClientId)},
  turnstileSiteKey: ${JSON.stringify(turnstileSiteKey)},
};
`,
);
console.log(`environment.prod.ts → apiUrl=${apiUrl || '(vide)'} · googleClientId=${googleClientId ? 'défini' : '(vide)'} · turnstile=${turnstileSiteKey ? 'actif' : 'désactivé'}`);

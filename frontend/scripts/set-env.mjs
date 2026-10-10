// Génère src/environments/environment.prod.ts à partir des variables d'environnement
// du build (Vercel → Settings → Environment Variables) :
//   API_URL           ex. https://api.justicia.gn      (« /api » est ajouté si absent)
//   GOOGLE_CLIENT_ID  identifiant OAuth Google (facultatif)
// Sans variable définie, le fichier existant est conservé tel quel.
import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../src/environments/environment.prod.ts', import.meta.url);
const current = readFileSync(file, 'utf8');
const pick = (key) => current.match(new RegExp(`${key}:\\s*'([^']*)'`))?.[1] ?? '';

let apiUrl = (process.env.API_URL || pick('apiUrl')).trim().replace(/\/+$/, '');
if (apiUrl && !apiUrl.endsWith('/api')) apiUrl += '/api';
const googleClientId = (process.env.GOOGLE_CLIENT_ID || pick('googleClientId')).trim();

if (!apiUrl.startsWith('https://')) {
  console.warn(`⚠️  API_URL n'est pas en HTTPS (${apiUrl || 'vide'}) : le navigateur bloquera les appels depuis Vercel.`);
}

writeFileSync(file, `// Généré par scripts/set-env.mjs — modifiable aussi à la main.
export const environment = {
  production: true,
  apiUrl: '${apiUrl}',
  googleClientId: '${googleClientId}',
};
`);
console.log(`environment.prod.ts → apiUrl=${apiUrl}`);

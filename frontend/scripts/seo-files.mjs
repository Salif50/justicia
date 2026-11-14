// Après la construction : sitemap.xml et robots.txt dans le dossier publié.
// Source unique : src/app/core/seo/public-pages.json (pages fixes) et
// src/app/pages/seo/data/routes.json (pages générées : textes, années du Journal officiel).
// Seules les pages réellement pré-rendues sont listées.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const SITE = (process.env.SITE_URL || 'https://justicia.mosagix.com').replace(/\/+$/, '');
const OUT = new URL('../dist/justicIA/browser/', import.meta.url);
const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));

const pages = read('../src/app/core/seo/public-pages.json');
const generated = read('../src/app/pages/seo/data/routes.json');
const prerendered = new Set(Object.keys(read('../dist/justicIA/prerendered-routes.json').routes));
// Date du dernier export du corpus : ne change pas d'une construction à l'autre sans nouveau contenu
const today = read('../src/app/pages/seo/data/figures.json').exporte_le || new Date().toISOString().slice(0, 10);

const entries = [
  ...pages.map((p) => ({ path: p.path, changefreq: p.changefreq, priority: p.priority, lastmod: today })),
  ...generated.map((r) => ({ ...r, lastmod: r.lastmod || today })),
].filter((e) => prerendered.has(e.path));

const missing = [...pages.map((p) => p.path), ...generated.map((r) => r.path)].filter((p) => !prerendered.has(p));
if (missing.length) console.warn(`⚠️  Non pré-rendues, absentes du sitemap : ${missing.join(', ')}`);

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url>
    <loc>${esc(SITE + (e.path === '/' ? '/' : e.path))}</loc>
    <lastmod>${e.lastmod}</lastmod>
    <changefreq>${e.changefreq}</changefreq>
    <priority>${Number(e.priority).toFixed(1)}</priority>
  </url>`).join('\n')}
</urlset>
`;

const robots = `# JusticIA — ${SITE}
User-agent: *
Allow: /
# Espaces privés (compte, administration) et pages techniques : rien à indexer
Disallow: /dashboard
Disallow: /admin
Disallow: /verify-email
Disallow: /reset-password
Disallow: /forgot-password
Disallow: /payment-return

Sitemap: ${SITE}/sitemap.xml
`;

if (!existsSync(OUT)) throw new Error('dist/justicIA/browser introuvable : lancer la construction avant ce script.');
writeFileSync(new URL('sitemap.xml', OUT), xml);
writeFileSync(new URL('robots.txt', OUT), robots);
console.log(`✓ sitemap.xml (${entries.length} pages) et robots.txt écrits pour ${SITE}`);

import { RenderMode, ServerRoute } from '@angular/ssr';
import { PUBLIC_PAGES } from './core/seo/public-pages';
import textes from './pages/seo/data/textes.json';
import jo from './pages/seo/data/jo-index.json';

/**
 * Pages publiques : pré-rendues en HTML complet à la construction, lisibles par
 * Google, Bing et les aperçus de liens (WhatsApp, Facebook, LinkedIn…).
 * Tout le reste (espace client, administration, connexion) est rendu dans le navigateur.
 */
export const serverRoutes: ServerRoute[] = [
  ...PUBLIC_PAGES.map(p => ({ path: p.path.replace(/^\//, ''), renderMode: RenderMode.Prerender }) as ServerRoute),
  {
    path: 'textes-de-loi-guinee/:slug',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => textes.map(t => ({ slug: t.slug })),
  },
  {
    path: 'journal-officiel-guinee/:annee',
    renderMode: RenderMode.Prerender,
    getPrerenderParams: async () => jo.annees.map(a => ({ annee: a.annee })),
  },
  { path: '**', renderMode: RenderMode.Client },
];

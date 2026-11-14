import pages from './public-pages.json';

/** Adresse publique du site (balises canoniques, plan du site, données structurées). */
export const SITE_URL = 'https://justicia.mosagix.com';
export const SITE_NAME = 'JusticIA';
/** Image d'aperçu des liens (1200 × 630). */
export const OG_IMAGE = `${SITE_URL}/og/justicia-og.png`;

export interface PublicPage {
  path: string;
  title: string;
  description: string;
  breadcrumb: string;
  changefreq: string;
  priority: number;
}

/** Pages publiques : pré-rendues, indexées et listées dans sitemap.xml (source unique). */
export const PUBLIC_PAGES: PublicPage[] = pages;

export function publicPage(path: string): PublicPage | undefined {
  const clean = '/' + path.split(/[?#]/)[0].replace(/^\/+|\/+$/g, '');
  return PUBLIC_PAGES.find(p => p.path === clean);
}

/** Pages générées (un texte, une année du Journal officiel) : balises posées par la page elle-même. */
export const DYNAMIC_PREFIXES = ['/textes-de-loi-guinee/', '/journal-officiel-guinee/'];

/** Vrai si le titre et les balises de cette adresse sont gérés par SeoService. */
export function isSeoManaged(url: string): boolean {
  const path = url.split(/[?#]/)[0];
  return !!publicPage(path) || DYNAMIC_PREFIXES.some(p => path.startsWith(p));
}

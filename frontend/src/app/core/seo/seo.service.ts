import { DOCUMENT, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
import { DYNAMIC_PREFIXES, OG_IMAGE, SITE_NAME, SITE_URL, publicPage } from './public-pages';

type JsonLd = Record<string, unknown>;

/** Description d'une page indexable (pages fixes et pages générées : textes, années du JO). */
export interface SeoPage {
  path: string;
  title: string;
  description: string;
  /** Fil d'Ariane après « Accueil » (le dernier élément est la page elle-même). */
  crumbs: { name: string; path: string }[];
}


const ORG_ID = `${SITE_URL}/#organisation`;
const SITE_ID = `${SITE_URL}/#site`;

/**
 * Référencement : balises de chaque page publique (titre, description, URL canonique,
 * aperçus de liens) et données structurées schema.org. Fonctionne au pré-rendu
 * comme dans le navigateur. Les pages privées sont exclues des moteurs (noindex).
 */
@Injectable({ providedIn: 'root' })
export class SeoService {
  private readonly doc = inject(DOCUMENT);
  private readonly meta = inject(Meta);
  private readonly title = inject(Title);
  private readonly router = inject(Router);
  private started = false;

  /** À appeler une fois au démarrage de l'application. */
  init(): void {
    if (this.started) return;
    this.started = true;
    // Les données propres à une page sont retirées avant la suivante ; la page les repose à son ouverture.
    this.router.events.pipe(filter(e => e instanceof NavigationStart)).subscribe(() => this.clearPageJsonLd());
    this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.apply(e.urlAfterRedirects));
  }

  private apply(url: string): void {
    const path = url.split(/[?#]/)[0];
    if (DYNAMIC_PREFIXES.some(p => path.startsWith(p))) return;
    const page = publicPage(url);
    if (!page) {
      this.meta.updateTag({ name: 'robots', content: 'noindex, nofollow' });
      this.removeCanonical();
      this.setJsonLd('site', null);
      return;
    }
    this.setPage({
      path: page.path, title: page.title, description: page.description,
      crumbs: page.path === '/' ? [] : [{ name: page.breadcrumb, path: page.path }],
    });
  }

  /** Balises complètes d'une page indexable. */
  setPage(page: SeoPage): void {
    const href = SITE_URL + (page.path === '/' ? '/' : page.path);
    this.title.setTitle(page.title);
    this.meta.updateTag({ name: 'robots', content: 'index, follow, max-snippet:-1, max-image-preview:large' });
    this.meta.updateTag({ name: 'description', content: page.description });
    this.meta.updateTag({ property: 'og:type', content: 'website' });
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:locale', content: 'fr_FR' });
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:description', content: page.description });
    this.meta.updateTag({ property: 'og:url', content: href });
    this.meta.updateTag({ property: 'og:image', content: OG_IMAGE });
    this.meta.updateTag({ property: 'og:image:width', content: '1200' });
    this.meta.updateTag({ property: 'og:image:height', content: '630' });
    this.meta.updateTag({ property: 'og:image:alt', content: 'JusticIA, l’assistant juridique du droit guinéen' });
    this.meta.updateTag({ name: 'twitter:card', content: 'summary_large_image' });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({ name: 'twitter:description', content: page.description });
    this.meta.updateTag({ name: 'twitter:image', content: OG_IMAGE });
    this.setCanonical(href);
    this.setJsonLd('site', this.siteGraph(page, href));
  }

  /** Organisation, site et fil d'Ariane : présents sur toutes les pages publiques. */
  private siteGraph(page: SeoPage, href: string): JsonLd {
    const graph: JsonLd[] = [
      {
        '@type': 'Organization',
        '@id': ORG_ID,
        name: SITE_NAME,
        url: SITE_URL + '/',
        logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/jia-mark@4x.png` },
        description: 'Assistant juridique fondé sur les textes officiels de la République de Guinée.',
        areaServed: { '@type': 'Country', name: 'Guinée' },
        knowsLanguage: ['fr'],
        parentOrganization: { '@type': 'Organization', name: 'Mosagix', url: 'https://mosagix.com' },
      },
      {
        '@type': 'WebSite',
        '@id': SITE_ID,
        url: SITE_URL + '/',
        name: SITE_NAME,
        alternateName: ['Justic IA', 'JusticIA Guinée'],
        inLanguage: 'fr-GN',
        publisher: { '@id': ORG_ID },
      },
      {
        '@type': 'WebPage',
        '@id': href + '#page',
        url: href,
        name: page.title,
        description: page.description,
        inLanguage: 'fr-GN',
        isPartOf: { '@id': SITE_ID },
        about: { '@type': 'Thing', name: 'Droit guinéen' },
      },
    ];
    if (page.crumbs.length) {
      graph.push({
        '@type': 'BreadcrumbList',
        itemListElement: [{ name: 'Accueil', path: '/' }, ...page.crumbs].map((c, i) => ({
          '@type': 'ListItem', position: i + 1, name: c.name, item: SITE_URL + (c.path === '/' ? '/' : c.path),
        })),
      });
    }
    return { '@context': 'https://schema.org', '@graph': graph };
  }

  /** Données structurées propres à une page (FAQ, liste, application…). `null` les retire. */
  setJsonLd(id: string, data: JsonLd | null): void {
    const attr = `ld-${id}`;
    let el = this.doc.head.querySelector<HTMLScriptElement>(`script[data-seo="${attr}"]`);
    if (!data) { el?.remove(); return; }
    if (!el) {
      el = this.doc.createElement('script');
      el.type = 'application/ld+json';
      el.setAttribute('data-seo', attr);
      this.doc.head.appendChild(el);
    }
    // « </ » échappé : un texte ne peut pas fermer la balise script
    el.textContent = JSON.stringify(data).replace(/<\//g, '<\\/');
  }

  private clearPageJsonLd(): void {
    this.doc.head.querySelectorAll('script[data-seo^="ld-page"]').forEach(el => el.remove());
  }

  private setCanonical(href: string): void {
    let link = this.doc.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', href);
  }

  private removeCanonical(): void {
    this.doc.head.querySelector('link[rel="canonical"]')?.remove();
  }
}

/** Questions fréquentes au format schema.org (FAQPage). */
export function faqJsonLd(items: { q: string; a: string }[]): JsonLd {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map(i => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

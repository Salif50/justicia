import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../../../components/header/header';
import { Footer } from '../../../components/footer/footer';
import { SeoService } from '../../../core/seo/seo.service';
import { SITE_URL } from '../../../core/seo/public-pages';
import { SeoCrumbs, SeoCta, frDate, frNumber } from '../shared/seo-shared';
import textes from '../data/textes.json';
import figures from '../data/figures.json';

/** Ordre d'affichage : les matières les plus recherchées d'abord. */
const ORDER = [
  'Constitution et institutions', 'Travail et protection sociale', 'Droit pénal', 'Justice et procédure',
  'Personnes, famille et biens', 'Droit OHADA', 'Affaires, commerce et OHADA', 'Finances, banque et fiscalité',
  'Foncier, construction et urbanisme',
];

@Component({
  selector: 'app-textes-public',
  imports: [RouterLink, Header, Footer, SeoCrumbs, SeoCta],
  templateUrl: './textes.html',
  styleUrl: '../seo.scss',
})
export class TextesPublic implements OnInit {
  private readonly seo = inject(SeoService);
  readonly fmt = frNumber;
  readonly date = frDate;
  readonly f = figures;
  readonly crumbs = [{ name: 'Codes et lois de Guinée', path: '/textes-de-loi-guinee' }];
  readonly total = textes.length;
  readonly articles = textes.reduce((s, t) => s + t.articles, 0);
  readonly groups = Object.entries(
    textes.reduce<Record<string, typeof textes>>((acc, t) => ((acc[t.categorie] ??= []).push(t), acc), {}),
  )
    .map(([categorie, items]) => ({ categorie, items: [...items].sort((a, b) => b.articles - a.articles) }))
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.categorie), ib = ORDER.indexOf(b.categorie);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.categorie.localeCompare(b.categorie, 'fr');
    });

  meta(t: { numero: string; date: string; annee: number | null }): string {
    return [t.numero, t.date && t.date !== String(t.annee) ? frDate(t.date) : t.annee].filter(Boolean).join(' · ');
  }

  ngOnInit(): void {
    this.seo.setJsonLd('page-list', {
      '@context': 'https://schema.org',
      '@type': 'ItemList',
      name: 'Codes et lois de la République de Guinée',
      numberOfItems: textes.length,
      itemListElement: textes.map((t, i) => ({
        '@type': 'ListItem', position: i + 1, name: t.nom, url: `${SITE_URL}/textes-de-loi-guinee/${t.slug}`,
      })),
    });
  }
}

import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Header } from '../../../components/header/header';
import { Footer } from '../../../components/footer/footer';
import { SeoService } from '../../../core/seo/seo.service';
import { SITE_URL } from '../../../core/seo/public-pages';
import { SeoCrumbs, SeoCta, frDate, frNumber } from '../shared/seo-shared';

export interface TexteData {
  slug: string; doc_id: string; nom: string; type: string; famille: string; numero: string;
  annee: number | null; date: string; categorie: string; domaine: string; articles: number;
  source: string; source_url: string; decisions_citant: number; ohada: boolean; sections: number; note: string;
  sommaire: { n: number; t: string; a: string }[];
  cite: { nom: string; numero: string }[];
  cite_par: { nom: string; numero: string }[];
}

@Component({
  selector: 'app-texte-public',
  imports: [RouterLink, Header, Footer, SeoCrumbs, SeoCta],
  templateUrl: './texte.html',
  styleUrl: '../seo.scss',
})
export class TextePublic implements OnInit {
  private readonly seo = inject(SeoService);
  readonly t: TexteData = inject(ActivatedRoute).snapshot.data['texte'];
  readonly fmt = frNumber;
  readonly date = frDate;
  crumbs: { name: string; path: string }[] = [];

  ngOnInit(): void {
    const t = this.t;
    if (!t) return;
    const path = `/textes-de-loi-guinee/${t.slug}`;
    const parent = t.ohada
      ? { name: 'Droit OHADA en Guinée', path: '/droit-ohada-guinee' }
      : { name: 'Codes et lois de Guinée', path: '/textes-de-loi-guinee' };
    this.crumbs = [parent, { name: t.nom, path }];
    const when = t.annee ? ` (${t.annee})` : '';
    const ref = t.numero ? `${t.numero}, ` : '';
    this.seo.setPage({
      path,
      title: `${t.nom}${when} : sommaire et articles — JusticIA`,
      description: `${t.nom}${t.ohada ? '' : ' de Guinée'} (${ref}${t.annee ?? 'texte en vigueur'}) : ${frNumber(t.articles)} articles`
        + (t.sections ? `, ${t.sections} titres, chapitres et sections` : '')
        + '. Consultez le sommaire et posez vos questions à JusticIA, qui cite l’article exact.',
      crumbs: this.crumbs,
    });
    this.seo.setJsonLd('page-legislation', {
      '@context': 'https://schema.org',
      '@type': 'Legislation',
      name: t.nom,
      ...(t.numero ? { legislationIdentifier: t.numero } : {}),
      ...(/^\d{4}-\d{2}-\d{2}$/.test(t.date) ? { legislationDate: t.date } : {}),
      legislationJurisdiction: t.ohada ? 'OHADA' : 'Guinée',
      legislationLegalForce: 'https://schema.org/InForce',
      inLanguage: 'fr',
      url: SITE_URL + path,
      ...(t.source_url ? { isBasedOn: t.source_url } : {}),
    });
  }

  /** Lien vers la source, sans le protocole. */
  host(url: string): string {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
  }
}

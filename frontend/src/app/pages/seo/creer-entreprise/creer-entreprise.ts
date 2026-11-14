import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../../../components/header/header';
import { Footer } from '../../../components/footer/footer';
import { SeoService, faqJsonLd } from '../../../core/seo/seo.service';
import { SITE_URL } from '../../../core/seo/public-pages';
import { SeoCrumbs, SeoCta } from '../shared/seo-shared';
import guide from '../data/entreprise.json';

function gnf(v: string): number { return Number((v || '').replace(/\D/g, '')) || 0; }

/** Guide public « Créer une entreprise en Guinée » : fiches 2026 du guichet unique APIP / GDB. */
@Component({
  selector: 'app-creer-entreprise',
  imports: [RouterLink, Header, Footer, SeoCrumbs, SeoCta],
  templateUrl: './creer-entreprise.html',
  styleUrl: '../seo.scss',
})
export class CreerEntreprise implements OnInit {
  private readonly seo = inject(SeoService);
  readonly g = guide;
  readonly crumbs = [{ name: 'Créer une entreprise en Guinée', path: '/creer-entreprise-guinee' }];
  /** Forme la moins chère au guichet (montant réel des fiches, pas une estimation). */
  readonly cheapest = guide.formes.filter(f => gnf(f.frais_guichet) > 0)
    .sort((a, b) => gnf(a.frais_guichet) - gnf(b.frais_guichet))[0];

  ngOnInit(): void {
    this.seo.setJsonLd('page-faq', faqJsonLd(guide.faq));
    this.seo.setJsonLd('page-howto', {
      '@context': 'https://schema.org',
      '@type': 'HowTo',
      name: 'Créer une entreprise en Guinée',
      description: `Étapes de création d’une société au guichet unique APIP / Guinea Development Board : ${guide.delai}.`,
      totalTime: 'PT72H',
      inLanguage: 'fr-GN',
      url: `${SITE_URL}/creer-entreprise-guinee`,
      step: guide.etapes.map(e => ({ '@type': 'HowToStep', position: e.num, name: e.titre, text: e.description })),
    });
  }
}

import { Component, OnInit, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Header } from '../../../components/header/header';
import { Footer } from '../../../components/footer/footer';
import { SeoService, faqJsonLd } from '../../../core/seo/seo.service';
import { SeoCrumbs, SeoCta, frNumber } from '../shared/seo-shared';
import ohada from '../data/ohada.json';

/**
 * Réponses recopiées des articles (vérifiés dans le corpus) : ne rien ajouter
 * qui ne figure pas dans le texte cité.
 */
const FAQ = [
  {
    q: 'Les Actes uniformes OHADA s’appliquent-ils en Guinée ?',
    a: 'Oui. Selon l’article 10 du Traité OHADA, « les actes uniformes sont directement applicables et obligatoires dans les Etats Parties, nonobstant toute disposition contraire de droit interne, antérieure ou postérieure ».',
  },
  {
    q: 'Quel est le capital minimum d’une société anonyme ?',
    a: 'L’article 387 de l’Acte uniforme relatif au droit des sociétés commerciales et du GIE (AUSCGIE) dispose : « Le capital social minimum est fixé à dix millions (10.000.000) de francs CFA. »',
  },
  {
    q: 'Quel délai pour faire opposition à une injonction de payer ?',
    a: 'Selon l’article 10 de l’Acte uniforme portant organisation des procédures simplifiées de recouvrement et des voies d’exécution (AUPSRVE), « l’opposition doit être formée dans les dix jours qui suivent la signification de l’ordonnance portant injonction de payer ».',
  },
  {
    q: 'Qu’est-ce que la cessation des paiements ?',
    a: 'Selon l’article 25 de l’Acte uniforme portant organisation des procédures collectives d’apurement du passif (AUPCAP), « la cessation des paiements est l’état où le débiteur se trouve dans l’impossibilité de faire face à son passif exigible avec son actif disponible ». Le débiteur doit la déclarer « au plus tard dans les trente (30) jours qui suivent la cessation des paiements ».',
  },
];

@Component({
  selector: 'app-ohada-public',
  imports: [RouterLink, Header, Footer, SeoCrumbs, SeoCta],
  templateUrl: './ohada-public.html',
  styleUrl: '../seo.scss',
})
export class OhadaPublic implements OnInit {
  private readonly seo = inject(SeoService);
  readonly o = ohada;
  readonly faq = FAQ;
  readonly fmt = frNumber;
  readonly crumbs = [{ name: 'Droit OHADA en Guinée', path: '/droit-ohada-guinee' }];
  readonly actesArticles = ohada.actes.reduce((s, a) => s + a.articles, 0);

  ngOnInit(): void {
    this.seo.setJsonLd('page-faq', faqJsonLd(FAQ));
  }
}

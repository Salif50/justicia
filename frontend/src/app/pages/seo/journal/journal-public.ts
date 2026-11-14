import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Header } from '../../../components/header/header';
import { Footer } from '../../../components/footer/footer';
import { SeoService } from '../../../core/seo/seo.service';
import { SeoCrumbs, SeoCta, frDate, frNumber } from '../shared/seo-shared';
import index from '../data/jo-index.json';

export interface JoIssue {
  numero: string; special: boolean; date: string; titre: string; theme: string;
  entrees: { nature: string; intitule: string }[];
}

@Component({
  selector: 'app-journal-public',
  imports: [RouterLink, Header, Footer, SeoCrumbs, SeoCta],
  templateUrl: './journal-public.html',
  styleUrl: '../seo.scss',
})
export class JournalPublic implements OnInit {
  private readonly seo = inject(SeoService);
  private readonly route = inject(ActivatedRoute);
  readonly idx = index;
  readonly fmt = frNumber;
  readonly date = frDate;
  /** Année affichée, ou null pour la page d'ensemble. */
  annee: string | null = null;
  issues: JoIssue[] = index.recents;
  yearInfo: (typeof index.annees)[number] | undefined;
  crumbs: { name: string; path: string }[] = [];

  label(n: JoIssue): string {
    return `Journal officiel n°${n.numero}${n.special ? ' (spécial)' : ''}`;
  }

  ngOnInit(): void {
    // Même composant d'une année à l'autre : on suit les changements de route.
    this.route.data.subscribe(data => this.show(this.route.snapshot.paramMap.get('annee'), data['issues']));
  }

  private show(annee: string | null, issues: JoIssue[] | null | undefined): void {
    this.annee = annee;
    this.issues = issues ?? index.recents;
    this.yearInfo = index.annees.find(a => a.annee === annee);
    const root = { name: 'Journal officiel de Guinée', path: '/journal-officiel-guinee' };
    this.crumbs = [root];
    if (!annee) return;           // page d'ensemble : balises fixes (public-pages.json)
    const y = this.yearInfo;
    const path = `/journal-officiel-guinee/${annee}`;
    this.crumbs = [root, { name: annee, path }];
    this.seo.setPage({
      path,
      title: `Journal officiel de Guinée ${annee} : sommaires des ${y?.numeros ?? ''} numéros`,
      description: `Sommaires du Journal officiel de la République de Guinée pour ${annee} : `
        + `${y?.numeros ?? 0} numéros et ${y?.textes ?? 0} lois, ordonnances, décrets et arrêtés publiés, avec leur référence.`,
      crumbs: this.crumbs,
    });
  }
}

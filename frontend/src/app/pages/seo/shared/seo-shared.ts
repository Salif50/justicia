import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

/** « 2026-10-27 » → « 27 octobre 2026 » ; « 19/12/2020 » aussi ; une année seule reste telle quelle. */
export function frDate(raw: string | number | null | undefined): string {
  const s = String(raw ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${+m[3] === 1 ? '1er' : +m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${+m[1] === 1 ? '1er' : +m[1]} ${MONTHS[+m[2] - 1]} ${m[3]}`;
  return s;
}

export function frNumber(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** Fil d'Ariane visible (le même que celui des données structurées). */
@Component({
  selector: 'app-seo-crumbs',
  imports: [RouterLink],
  template: `
    <nav class="sx-crumb" aria-label="Fil d’Ariane">
      <ol>
        <li><a routerLink="/">Accueil</a></li>
        @for (c of crumbs(); track c.path; let last = $last) {
          <li>
            @if (last) { <span aria-current="page">{{ c.name }}</span> }
            @else { <a [routerLink]="c.path">{{ c.name }}</a> }
          </li>
        }
      </ol>
    </nav>`,
  styleUrl: './seo-parts.scss',
})
export class SeoCrumbs {
  readonly crumbs = input.required<{ name: string; path: string }[]>();
}

/** Bandeau d'appel : poser sa question à JusticIA. */
@Component({
  selector: 'app-seo-cta',
  imports: [RouterLink],
  template: `
    <section class="sx-section">
      <div class="pub-container">
        <div class="sx-cta">
          <div>
            <h2>{{ title() }}</h2>
            <p>{{ text() }}</p>
          </div>
          <a routerLink="/signup" class="pub-btn pub-btn--ink">
            Créer un compte gratuit
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
          </a>
        </div>
      </div>
    </section>`,
  styleUrl: './seo-parts.scss',
})
export class SeoCta {
  readonly title = input('Une question précise ? Posez-la à JusticIA.');
  readonly text = input('JusticIA retrouve l’article applicable dans les textes officiels guinéens, le cite mot pour mot et vous l’explique. Compte gratuit, sans carte bancaire.');
}

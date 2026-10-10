import {
  AfterViewInit, Component, ElementRef, NgZone, OnDestroy, ViewChild, signal,
} from '@angular/core';

interface Dot { cand: boolean; src: boolean; cited: boolean; }

const STEPS = [
  { n: '12 282', unit: 'articles indexés', title: 'Toute la loi, découpée article par article',
    text: "33 codes, lois et décrets en vigueur sont indexés au niveau de l'article, avec leur source officielle." },
  { n: '30', unit: 'candidats', title: 'Une double recherche, par le sens et par les mots',
    text: "La question est comprise, le domaine détecté, puis une recherche sémantique et une recherche par mots-clés retiennent une trentaine d'articles." },
  { n: '≤ 10', unit: 'sources', title: 'Un tri par pertinence juridique',
    text: 'Un second modèle relit chaque candidat face à la question et ne garde que les articles qui y répondent vraiment.' },
  { n: '1', unit: 'citation vérifiée', title: 'Une réponse qui cite le texte exact',
    text: "La réponse cite l'article mot pour mot. Une référence qu'on ne peut pas rattacher à une source retrouvée n'est jamais affichée." },
];

const COLS = 24, ROWS = 14;

/** Récit épinglé au défilement : de 12 282 articles à une citation vérifiée. */
@Component({
  selector: 'app-scroll-story',
  templateUrl: './scroll-story.html',
  styleUrl: './scroll-story.scss',
})
export class ScrollStory implements AfterViewInit, OnDestroy {
  @ViewChild('track') track?: ElementRef<HTMLElement>;

  readonly steps = STEPS;
  readonly step = signal(0);
  readonly progress = signal(0);
  readonly pinned = signal(true);
  readonly dots: Dot[] = buildDots();

  private raf = 0;
  private onScroll = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.measure());
  };
  private mq?: MediaQueryList;

  constructor(private zone: NgZone) {}

  ngAfterViewInit() {
    if (typeof window === 'undefined') return;
    // Pas d'épinglage sur petit écran ni en mouvement réduit : étapes empilées
    this.mq = window.matchMedia('(min-width: 961px) and (prefers-reduced-motion: no-preference)');
    const apply = () => {
      this.pinned.set(this.mq!.matches);
      if (!this.mq!.matches) this.step.set(STEPS.length - 1);
      else this.measure();
    };
    apply();
    this.mq.addEventListener('change', apply);
    this.zone.runOutsideAngular(() => window.addEventListener('scroll', this.onScroll, { passive: true }));
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') window.removeEventListener('scroll', this.onScroll);
    cancelAnimationFrame(this.raf);
  }

  private measure() {
    if (!this.pinned() || !this.track) return;
    const r = this.track.nativeElement.getBoundingClientRect();
    const total = r.height - window.innerHeight;
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, total)));
    const s = Math.min(STEPS.length - 1, Math.floor(p * STEPS.length * 0.999));
    if (s !== this.step() || Math.abs(p - this.progress()) > 0.01) {
      this.zone.run(() => { this.step.set(s); this.progress.set(p); });
    }
  }

  stateOf(d: Dot): string {
    const s = this.step();
    if (s === 0) return 'all';
    if (s === 1) return d.cand ? 'on' : 'off';
    if (s === 2) return d.src ? 'on' : 'off';
    return d.cited ? 'cited' : 'off';
  }
}

/** Grille de points : 30 candidats, 10 sources parmi eux, 1 citation (positions fixes). */
function buildDots(): Dot[] {
  let seed = 7;
  const rand = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const n = COLS * ROWS;
  const idx = new Set<number>();
  while (idx.size < 30) idx.add(Math.floor(rand() * n));
  const cand = [...idx];
  const src = new Set(cand.slice(0, 10));
  const cited = cand[3];
  return Array.from({ length: n }, (_, i) => ({ cand: idx.has(i), src: src.has(i), cited: i === cited }));
}

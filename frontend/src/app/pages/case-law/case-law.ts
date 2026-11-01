import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  DecisionDetail, DecisionSearch, DecisionSummary, LibraryService, frDate,
} from '../../services/library.service';

type Sort = 'recent' | 'ancien' | 'pertinence';

/**
 * Jurisprudence — décisions réelles (Cour suprême, CCJA, Cour d'appel, tribunaux).
 * Texte intégral tel que publié ; noms des parties pseudonymisés par la source.
 * Les filtres vivent dans l'URL : une recherche se partage par simple lien.
 */
@Component({
  selector: 'app-case-law',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './case-law.html',
  styleUrl: './case-law.scss',
})
export class CaseLaw implements OnInit, OnDestroy {
  private lib    = inject(LibraryService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  readonly frDate = frDate;
  readonly PAGE = 20;

  // ── Liste ─────────────────────────────────────────────────────────────────
  q           = signal('');
  juridiction = signal('');
  matiere     = signal('');
  annee       = signal<number | null>(null);
  sort        = signal<Sort>('recent');
  docId       = signal('');
  article     = signal('');

  result   = signal<DecisionSearch | null>(null);
  items    = signal<DecisionSummary[]>([]);
  loading  = signal(true);
  loadingMore = signal(false);
  error    = signal('');

  // ── Lecture d'une décision ────────────────────────────────────────────────
  decisionId = signal<string | null>(null);
  decision   = signal<DecisionDetail | null>(null);
  detailLoading = signal(false);
  detailError   = signal('');
  findText   = signal('');
  copied     = signal(false);

  private search$ = new Subject<string>();
  private subs: Subscription[] = [];

  activeFilters = computed(() => {
    const f: { key: string; label: string }[] = [];
    if (this.juridiction()) f.push({ key: 'juridiction', label: this.juridiction() });
    if (this.matiere())     f.push({ key: 'matiere', label: this.matiere() });
    if (this.annee())       f.push({ key: 'annee', label: String(this.annee()) });
    if (this.docId())       f.push({ key: 'doc', label: `Cite ${this.article() ? 'l’article ' + this.article() : 'ce texte'}` });
    return f;
  });

  canLoadMore = computed(() => (this.result()?.total ?? 0) > this.items().length);

  /** Paragraphes du texte intégral, avec repérage du terme cherché. */
  paragraphs = computed(() => {
    const d = this.decision();
    if (!d) return [] as { text: string; hit: boolean; key: boolean }[];
    const needle = this.norm(this.findText().trim());
    return d.texte.split(/\n{2,}|\n/).map(t => t.trim()).filter(Boolean).map(text => ({
      text,
      hit: needle.length > 2 && this.norm(text).includes(needle),
      key: /^(PAR CES MOTIFS|EN LA FORME|AU FOND|Sur le (premier|deuxième|second|troisième)|SUR LE)/i.test(text),
    }));
  });

  hitCount = computed(() => this.paragraphs().filter(p => p.hit).length);

  ngOnInit(): void {
    this.subs.push(
      this.search$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => {
        this.q.set(v);
        if (v && this.sort() === 'recent') this.sort.set('pertinence');
        this.syncUrl();
      }),
      this.route.paramMap.subscribe(p => {
        const id = p.get('id');
        this.decisionId.set(id);
        if (id) this.openDecision(id);
      }),
      this.route.queryParamMap.subscribe(qp => {
        this.q.set(qp.get('q') ?? '');
        this.juridiction.set(qp.get('juridiction') ?? '');
        this.matiere.set(qp.get('matiere') ?? '');
        this.annee.set(qp.get('annee') ? Number(qp.get('annee')) : null);
        this.sort.set((qp.get('sort') as Sort) || (qp.get('q') ? 'pertinence' : 'recent'));
        this.docId.set(qp.get('doc') ?? '');
        this.article.set(qp.get('article') ?? '');
        if (!this.decisionId()) this.load();
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  // ── Liste ─────────────────────────────────────────────────────────────────
  private query(offset = 0) {
    return {
      q: this.q(), juridiction: this.juridiction(), matiere: this.matiere(), annee: this.annee(),
      sort: this.sort(), doc_id: this.docId(), article: this.article(), offset, limit: this.PAGE,
    };
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.lib.decisions(this.query()).subscribe({
      next: r => { this.result.set(r); this.items.set(r.decisions); this.loading.set(false); },
      error: () => { this.error.set('La jurisprudence n’a pas pu être chargée.'); this.loading.set(false); },
    });
  }

  loadMore(): void {
    if (this.loadingMore()) return;
    this.loadingMore.set(true);
    this.lib.decisions(this.query(this.items().length)).subscribe({
      next: r => { this.items.update(list => [...list, ...r.decisions]); this.loadingMore.set(false); },
      error: () => this.loadingMore.set(false),
    });
  }

  onSearch(value: string): void { this.search$.next(value.trim()); }

  setFilter(key: 'juridiction' | 'matiere' | 'annee' | 'sort', value: string): void {
    if (key === 'annee') this.annee.set(value ? Number(value) : null);
    else if (key === 'sort') this.sort.set(value as Sort);
    else this[key].set(value);
    this.syncUrl();
  }

  clearFilter(key: string): void {
    if (key === 'doc') { this.docId.set(''); this.article.set(''); }
    else this.setFilter(key as 'juridiction' | 'matiere' | 'annee', '');
    this.syncUrl();
  }

  resetAll(): void {
    this.q.set(''); this.juridiction.set(''); this.matiere.set(''); this.annee.set(null);
    this.docId.set(''); this.article.set(''); this.sort.set('recent');
    this.syncUrl();
  }

  private syncUrl(): void {
    this.router.navigate(['/dashboard/case-law'], {
      queryParams: {
        q: this.q() || null, juridiction: this.juridiction() || null, matiere: this.matiere() || null,
        annee: this.annee() || null, sort: this.sort() !== 'recent' ? this.sort() : null,
        doc: this.docId() || null, article: this.article() || null,
      },
      replaceUrl: true,
    });
  }

  // ── Décision ──────────────────────────────────────────────────────────────
  private openDecision(id: string): void {
    this.detailLoading.set(true);
    this.detailError.set('');
    this.decision.set(null);
    this.findText.set('');
    this.lib.decision(id).subscribe({
      next: d => { this.decision.set(d); this.detailLoading.set(false); window.scrollTo({ top: 0 }); },
      error: () => { this.detailError.set('Décision introuvable.'); this.detailLoading.set(false); },
    });
  }

  backToList(): void {
    this.router.navigate(['/dashboard/case-law'], { queryParamsHandling: 'preserve' });
  }

  askAi(d: DecisionDetail): void {
    const q = `Explique-moi simplement la décision « ${this.label(d)} »` +
      (d.objet ? ` (objet : ${d.objet})` : '') +
      ` : quel était le problème juridique, qu’a décidé la juridiction et sur quels textes s’est-elle fondée ?`;
    this.router.navigate(['/dashboard/chat'], { queryParams: { q } });
  }

  copyReference(d: DecisionDetail): void {
    const ref = `${this.label(d)}${d.source_url ? ' — ' + d.source_url : ''}`;
    navigator.clipboard?.writeText(ref).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1600);
    });
  }

  print(): void { window.print(); }

  label(d: { juridiction: string; chambre?: string; date: string; numero: string }): string {
    const parts = [d.juridiction];
    if (d.date) parts.push(frDate(d.date));
    if (d.numero) parts.push(d.numero.startsWith('RP') ? d.numero : `n° ${d.numero}`);
    return parts.join(', ');
  }

  parties(d: DecisionSummary): string {
    const { demandeur, defendeur } = d.parties || { demandeur: '', defendeur: '' };
    if (!demandeur && !defendeur) return '';
    return `${this.short(demandeur)} c/ ${this.short(defendeur)}`;
  }

  short(s: string, n = 70): string {
    s = (s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  }

  private norm(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  trackId = (_: number, d: DecisionSummary) => d.id;
}

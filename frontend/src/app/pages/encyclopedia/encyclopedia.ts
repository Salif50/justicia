import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import {
  ArticleHit, ArticleSearch, LibraryArticle, LibraryCatalog, LibraryDoc, LibraryDocDetail, LibraryService, TocEntry,
} from '../../services/library.service';

interface Seg { t: string; hit: boolean; }

/**
 * Bibliothèque juridique — les textes réellement indexés par le moteur de réponse.
 *  - catalogue : 65+ textes, statut (en vigueur, abrogé, projet, historique) et source ;
 *  - recherche plein texte instantanée dans tous les articles en vigueur ;
 *  - lecteur : sommaire, articles tels qu'indexés, renvoi vers la jurisprudence qui les cite.
 */
@Component({
  selector: 'app-encyclopedia',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './encyclopedia.html',
  styleUrl: './encyclopedia.scss',
})
export class Encyclopedia implements OnInit, OnDestroy {
  private lib    = inject(LibraryService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  readonly WINDOW = 40;

  // ── Catalogue ─────────────────────────────────────────────────────────────
  catalog   = signal<LibraryCatalog | null>(null);
  loading   = signal(true);
  error     = signal('');
  category  = signal('Tous');
  showOld   = signal(false);

  query     = signal('');
  searching = signal(false);
  hits      = signal<ArticleSearch | null>(null);
  private search$ = new Subject<string>();

  categories = computed(() => {
    const c = this.catalog();
    if (!c) return [] as { name: string; count: number }[];
    const docs = c.documents.filter(d => this.showOld() || d.statut === 'en_vigueur');
    const counts = new Map<string, number>();
    docs.forEach(d => counts.set(d.categorie, (counts.get(d.categorie) ?? 0) + 1));
    return [{ name: 'Tous', count: docs.length },
            ...[...counts.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr')).map(([name, count]) => ({ name, count }))];
  });

  documents = computed(() => {
    const c = this.catalog();
    if (!c) return [] as LibraryDoc[];
    return c.documents.filter(d =>
      (this.showOld() || d.statut === 'en_vigueur') &&
      (this.category() === 'Tous' || d.categorie === this.category()));
  });

  oldCount = computed(() => this.catalog()?.documents.filter(d => d.statut !== 'en_vigueur').length ?? 0);

  // ── Lecteur ───────────────────────────────────────────────────────────────
  docId      = signal<string | null>(null);
  doc        = signal<LibraryDocDetail | null>(null);
  docLoading = signal(false);
  docError   = signal('');
  articles   = signal<LibraryArticle[]>([]);
  total      = signal(0);
  start      = signal(0);            // index du premier article affiché
  inDocQuery = signal('');
  loadingArticles = signal(false);
  focusIndex = signal<number | null>(null);
  tocOpen    = signal(false);
  copiedIdx  = signal<number | null>(null);
  private inDoc$ = new Subject<string>();

  hasBefore = computed(() => !this.inDocQuery() && this.start() > 0);
  hasAfter  = computed(() => this.start() + this.articles().length < this.total());

  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.lib.catalog().subscribe({
      next: c => { this.catalog.set(c); this.loading.set(false); },
      error: () => { this.error.set('La bibliothèque n’a pas pu être chargée.'); this.loading.set(false); },
    });

    this.subs.push(
      this.search$.pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap(q => {
          this.query.set(q);
          if (q.length < 2) { this.searching.set(false); return of(null); }
          this.searching.set(true);
          return this.lib.search(q).pipe(catchError(() => of(null)));
        }),
      ).subscribe(r => { this.hits.set(r); this.searching.set(false); }),

      this.inDoc$.pipe(debounceTime(250), distinctUntilChanged()).subscribe(q => {
        this.inDocQuery.set(q);
        this.loadWindow(0, true);
      }),

      this.route.paramMap.subscribe(p => {
        const id = p.get('docId');
        this.docId.set(id);
        if (id) this.openDoc(id, this.route.snapshot.queryParamMap.get('article'));
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  onSearch(v: string): void { this.search$.next(v.trim()); }

  segments(text: string): Seg[] {
    const terms = this.query().split(/\s+/).filter(t => t.length > 1).map(t => this.fold(t));
    if (!terms.length) return [{ t: text, hit: false }];
    const folded = this.fold(text);
    const marks = new Array(text.length).fill(false);
    for (const term of terms) {
      let i = folded.indexOf(term);
      while (i >= 0) { for (let k = i; k < i + term.length; k++) marks[k] = true; i = folded.indexOf(term, i + term.length); }
    }
    const out: Seg[] = [];
    for (let i = 0; i < text.length; i++) {
      const last = out[out.length - 1];
      if (last && last.hit === marks[i]) last.t += text[i];
      else out.push({ t: text[i], hit: marks[i] });
    }
    return out;
  }

  /** Minuscules sans accents, même longueur que le texte d'origine (pour surligner). */
  private fold(s: string): string {
    return [...s].map(ch => ch.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()[0] ?? ch).join('');
  }

  openHit(h: ArticleHit): void {
    this.router.navigate(['/dashboard/encyclopedia', h.doc_id], { queryParams: { i: h.index } });
  }

  // ── Lecteur ───────────────────────────────────────────────────────────────
  private openDoc(id: string, article: string | null): void {
    this.docLoading.set(true);
    this.docError.set('');
    this.doc.set(null);
    this.articles.set([]);
    this.inDocQuery.set('');
    this.focusIndex.set(null);
    this.lib.document(id).subscribe({
      next: d => {
        this.doc.set(d);
        this.docLoading.set(false);
        const i = this.route.snapshot.queryParamMap.get('i');
        if (i !== null) {
          this.jumpTo(Number(i));
        } else if (article) {
          // Numéro d'article demandé (depuis une décision ou une réponse) : on retrouve sa position
          this.lib.articles(id, 0, 1, article).subscribe(r => {
            if (r.articles.length) this.jumpTo(r.articles[0].index);
            else this.loadWindow(0);
          });
        } else {
          this.loadWindow(0);
        }
        window.scrollTo({ top: 0 });
      },
      error: () => { this.docError.set('Ce texte est introuvable.'); this.docLoading.set(false); },
    });
  }

  loadWindow(offset: number, reset = true, focus: number | null = null): void {
    const id = this.docId();
    if (!id) return;
    this.loadingArticles.set(true);
    this.lib.articles(id, offset, this.WINDOW, this.inDocQuery()).subscribe({
      next: r => {
        this.total.set(r.total);
        if (reset) { this.start.set(offset); this.articles.set(r.articles); }
        else this.articles.update(a => [...a, ...r.articles]);
        this.loadingArticles.set(false);
        if (focus !== null) {
          this.focusIndex.set(focus);
          setTimeout(() => document.getElementById(`art-${focus}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        }
      },
      error: () => this.loadingArticles.set(false),
    });
  }

  loadAfter(): void { this.loadWindow(this.start() + this.articles().length, false); }

  loadBefore(): void {
    const from = Math.max(0, this.start() - this.WINDOW);
    const keep = this.articles();
    const id = this.docId();
    if (!id) return;
    this.loadingArticles.set(true);
    this.lib.articles(id, from, this.start() - from).subscribe(r => {
      this.start.set(from);
      this.articles.set([...r.articles, ...keep]);
      this.loadingArticles.set(false);
    });
  }

  jumpTo(index: number): void {
    this.inDocQuery.set('');
    this.tocOpen.set(false);
    this.loadWindow(Math.max(0, index), true, index);
  }

  onInDoc(v: string): void { this.inDoc$.next(v.trim()); }

  tocVisible(t: TocEntry): boolean { return t.niveau <= 2; }

  copyArticle(a: LibraryArticle): void {
    const d = this.doc();
    const txt = `${a.article_ref} — ${d?.nom ?? ''}\n\n${a.texte}${a.source_url ? '\n\nSource : ' + a.source_url : ''}`;
    navigator.clipboard?.writeText(txt).then(() => {
      this.copiedIdx.set(a.index);
      setTimeout(() => this.copiedIdx.set(null), 1500);
    });
  }

  askAi(a: LibraryArticle | null): void {
    const d = this.doc();
    if (!d) return;
    const q = a
      ? `Explique-moi l’${a.article_ref.replace(/^Article/i, 'article')} du ${d.nom} : que prévoit-il concrètement et dans quels cas s’applique-t-il ?`
      : `Quelles sont les règles essentielles du ${d.nom} ?`;
    this.router.navigate(['/dashboard/chat'], { queryParams: { q } });
  }

  articleNum(ref: string): string {
    const m = /(\d+(?:[.\-]\d+)*)/.exec(ref || '');
    return m ? m[1] : '';
  }

  n(x: number): string { return (x ?? 0).toLocaleString('fr-FR'); }

  backToCatalog(): void { this.router.navigate(['/dashboard/encyclopedia']); }

  statusClass(s: string): string { return s === 'en_vigueur' ? '' : `lib-status--${s}`; }

  trackDoc = (_: number, d: LibraryDoc) => d.doc_id;
  trackArt = (_: number, a: LibraryArticle) => a.index;
}

import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, Subscription, debounceTime, distinctUntilChanged } from 'rxjs';
import { JoIssue, JoIssueSummary, JoList, LibraryService, frDate } from '../../services/library.service';

/**
 * Journal officiel — veille des textes publiés : chaque numéro, son sommaire, et pour chaque
 * texte annoncé le lien vers sa version intégrale dans la bibliothèque (quand on l'a).
 */
@Component({
  selector: 'app-journal-officiel',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './journal-officiel.html',
  styleUrl: './journal-officiel.scss',
})
export class JournalOfficiel implements OnInit, OnDestroy {
  private lib = inject(LibraryService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  readonly frDate = frDate;

  list = signal<JoList | null>(null);
  items = signal<JoIssueSummary[]>([]);
  annee = signal<number | null>(null);
  q = signal('');
  loading = signal(true);
  error = signal('');

  issueId = signal<string | null>(null);
  issue = signal<JoIssue | null>(null);
  issueLoading = signal(false);

  private q$ = new Subject<string>();
  private subs: Subscription[] = [];

  ngOnInit(): void {
    this.subs.push(
      this.q$.pipe(debounceTime(300), distinctUntilChanged()).subscribe(v => { this.q.set(v); this.load(); }),
      this.route.paramMap.subscribe(p => {
        const id = p.get('id');
        this.issueId.set(id);
        if (id) this.open(id);
        else if (!this.list()) this.load();
      }),
    );
  }

  ngOnDestroy(): void { this.subs.forEach(s => s.unsubscribe()); }

  load(append = false): void {
    this.loading.set(!append);
    this.error.set('');
    this.lib.journal({ annee: this.annee(), q: this.q(), offset: append ? this.items().length : 0, limit: 24 }).subscribe({
      next: r => { this.list.set(r); this.items.update(l => append ? [...l, ...r.numeros] : r.numeros); this.loading.set(false); },
      error: () => { this.error.set('Le Journal officiel n’a pas pu être chargé.'); this.loading.set(false); },
    });
  }

  setYear(y: number | null): void { this.annee.set(y); this.load(); }
  onSearch(v: string): void { this.q$.next(v.trim()); }

  private open(id: string): void {
    this.issueLoading.set(true);
    this.issue.set(null);
    this.lib.journalIssue(id).subscribe({
      next: n => { this.issue.set(n); this.issueLoading.set(false); window.scrollTo({ top: 0 }); },
      error: () => this.issueLoading.set(false),
    });
  }

  back(): void { this.router.navigate(['/dashboard/journal-officiel']); }

  /** Intitulé sans le préfixe « Décret D/… du … » déjà affiché à part. */
  objet(intitule: string): string {
    const m = /\bdu\s+\d{1,2}(?:er)?\s+\S+\s+\d{4}\s+(.*)$/i.exec(intitule);
    const o = (m ? m[1] : intitule).trim();
    return o.charAt(0).toUpperCase() + o.slice(1);
  }

  /** Numéro et date, sans le type d'acte déjà affiché (« Loi ORDINAIRE L/2026/003/AN du … » → « L/2026/003/AN du … »). */
  ref(intitule: string): string {
    const m = /^(.*?\bdu\s+\d{1,2}(?:er)?\s+\S+\s+\d{4})/i.exec(intitule);
    return m ? m[1].replace(/^(Loi organique|Loi ordinaire|Loi|Ordonnance|Décret|Arrêté|Décision|Instruction)\s+/i, '') : '';
  }
}

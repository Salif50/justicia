import { Component, HostListener, ElementRef, ViewChild, AfterViewInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription, debounceTime, distinctUntilChanged, switchMap, of, catchError } from 'rxjs';
import { SearchService } from '../../services/search.service';
import { LibraryService, QuickResults } from '../../services/library.service';

@Component({
  selector:    'app-global-search',
  imports:     [CommonModule, FormsModule],
  templateUrl: './global-search.html',
  styleUrl:    './global-search.scss',
})
export class GlobalSearch implements AfterViewInit, OnDestroy {
  svc    = inject(SearchService);
  router = inject(Router);
  private lib = inject(LibraryService);

  /** Droit guinéen : textes, articles et décisions (même index que la bibliothèque). */
  legal = signal<QuickResults | null>(null);
  private legal$ = new Subject<string>();
  private sub: Subscription = this.legal$.pipe(
    debounceTime(220),
    distinctUntilChanged(),
    switchMap(q => q.trim().length < 2 ? of(null) : this.lib.quick(q.trim()).pipe(catchError(() => of(null)))),
  ).subscribe(r => this.legal.set(r));

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  get legalCount(): number {
    const l = this.legal();
    return l ? l.textes.length + l.articles.length + l.decisions.length : 0;
  }

  @ViewChild('searchInput') inputRef!: ElementRef<HTMLInputElement>;

  ngAfterViewInit(): void {
    if (this.svc.isOpen()) this.focus();
  }

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    // Ctrl+K / Cmd+K — ouvrir/fermer
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      this.svc.toggle();
      if (this.svc.isOpen()) setTimeout(() => this.focus(), 50);
    }
    // Échap — fermer
    if (e.key === 'Escape' && this.svc.isOpen()) {
      this.svc.close();
    }
  }

  focus() { this.inputRef?.nativeElement?.focus(); }

  onInput(value: string) {
    this.svc.search(value);
    this.legal$.next(value);
  }

  navigate(link: string) {
    this.svc.close();
    this.router.navigateByUrl(link);
  }

  get results() { return this.svc.results(); }
  get loading()  { return this.svc.loading(); }
  get hasResults(){ return this.svc.totalResults > 0 || this.legalCount > 0; }
  get query()    { return this.svc.query(); }
  get isOpen()   { return this.svc.isOpen(); }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      conversation: 'C', case: 'D', document: 'F', note: 'N',
    };
    return icons[type] ?? 'R';
  }
}

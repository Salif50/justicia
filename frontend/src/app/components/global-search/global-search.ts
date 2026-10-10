import { Component, HostListener, ElementRef, ViewChild, AfterViewInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SearchService } from '../../services/search.service';

@Component({
  selector:    'app-global-search',
  imports:     [CommonModule, RouterLink, FormsModule],
  templateUrl: './global-search.html',
  styleUrl:    './global-search.scss',
})
export class GlobalSearch implements AfterViewInit {
  svc    = inject(SearchService);
  router = inject(Router);

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

  onInput(value: string) { this.svc.search(value); }

  navigate(link: string) {
    this.svc.close();
    this.router.navigateByUrl(link);
  }

  get results() { return this.svc.results(); }
  get loading()  { return this.svc.loading(); }
  get hasResults(){ return this.svc.totalResults > 0; }
  get query()    { return this.svc.query(); }
  get isOpen()   { return this.svc.isOpen(); }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      conversation: '💬', case: '⚖️', document: '📄', note: '📝',
    };
    return icons[type] ?? '🔍';
  }
}

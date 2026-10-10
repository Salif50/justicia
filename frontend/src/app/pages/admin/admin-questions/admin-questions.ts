import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { marked } from 'marked';
import {
  AdminConversationDetail, AdminQuestion, AdminService, QuestionQuery,
} from '../../../services/admin.service';
import { AGENT_LABELS } from '../admin-users/admin-users';

const PAGE_SIZE = 30;

@Component({
  selector: 'app-admin-questions',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-questions.html',
  styleUrl: './admin-questions.scss',
})
export class AdminQuestions implements OnInit, OnDestroy {
  private api    = inject(AdminService);
  private route  = inject(ActivatedRoute);
  private router = inject(Router);

  readonly items   = signal<AdminQuestion[]>([]);
  readonly total   = signal(0);
  readonly stats   = signal({ today: 0, week: 0, users_today: 0 });
  readonly loading = signal(true);
  readonly error   = signal('');

  readonly q        = signal('');
  readonly period   = signal<'all' | 'today' | '7d' | '30d'>('all');
  readonly agent    = signal('');
  readonly userId   = signal('');
  readonly userName = signal('');
  readonly page     = signal(0);

  readonly expanded = signal<string | null>(null);
  readonly conv     = signal<AdminConversationDetail | null>(null);
  readonly convLoading = signal(false);

  readonly agents = Object.entries(AGENT_LABELS).map(([id, label]) => ({ id, label }));
  readonly hasNext = computed(() => (this.page() + 1) * PAGE_SIZE < this.total());
  readonly pageLabel = computed(() => {
    const start = this.total() ? this.page() * PAGE_SIZE + 1 : 0;
    return `${start}–${Math.min((this.page() + 1) * PAGE_SIZE, this.total())} sur ${this.total()}`;
  });

  private search$ = new Subject<void>();

  ngOnInit() {
    const p = this.route.snapshot.queryParamMap;
    this.userId.set(p.get('user') ?? '');
    this.userName.set(p.get('name') ?? '');
    this.search$.pipe(debounceTime(300)).subscribe(() => { this.page.set(0); this.load(); });
    this.load();
  }

  ngOnDestroy() { this.search$.complete(); }

  load() {
    this.loading.set(true);
    this.error.set('');
    const query: QuestionQuery = {
      q: this.q(), period: this.period(), agent_id: this.agent(), user_id: this.userId(),
      skip: this.page() * PAGE_SIZE, limit: PAGE_SIZE,
    };
    this.api.listQuestions(query).subscribe({
      next: r => { this.items.set(r.items); this.total.set(r.total); this.stats.set(r.stats); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger les questions.'); this.loading.set(false); },
    });
  }

  onSearch(v: string) { this.q.set(v); this.search$.next(); }
  setFilter(key: string, value: string) {
    const target = (this as unknown as Record<string, { set?: (v: string) => void }>)[key];
    target?.set?.(value);
    this.page.set(0);
    this.load();
  }
  prevPage() { if (this.page() > 0) { this.page.update(p => p - 1); this.load(); } }
  nextPage() { if (this.hasNext()) { this.page.update(p => p + 1); this.load(); } }

  filterUser(item: AdminQuestion) {
    this.userId.set(item.user_id);
    this.userName.set(item.user_name);
    this.router.navigate([], { queryParams: { user: item.user_id, name: item.user_name }, replaceUrl: true });
    this.page.set(0);
    this.load();
  }

  clearUser() {
    this.userId.set('');
    this.userName.set('');
    this.router.navigate([], { queryParams: {}, replaceUrl: true });
    this.page.set(0);
    this.load();
  }

  toggle(id: string) { this.expanded.update(cur => cur === id ? null : id); }

  openConversation(id: string) {
    this.convLoading.set(true);
    this.conv.set(null);
    this.api.getConversationMessages(id).subscribe({
      next: c => { this.conv.set(c); this.convLoading.set(false); },
      error: () => this.convLoading.set(false),
    });
  }

  closeConversation() { this.conv.set(null); this.convLoading.set(false); }

  render(md: string | null): string {
    return md ? (marked.parse(md, { async: false }) as string) : '';
  }

  agentLabel(id: string) { return AGENT_LABELS[id] ?? id; }

  date(iso: string) {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }
}

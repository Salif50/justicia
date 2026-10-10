import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AdminAuditEntry, AdminService } from '../../../services/admin.service';
import { AUDIT_LABELS } from '../admin-users/admin-users';

const PAGE_SIZE = 50;

@Component({
  selector: 'app-admin-audit',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-audit.html',
  styleUrl: './admin-audit.scss',
})
export class AdminAudit implements OnInit {
  private api = inject(AdminService);

  readonly entries = signal<AdminAuditEntry[]>([]);
  readonly loading = signal(true);
  readonly error   = signal('');
  readonly page    = signal(0);
  readonly hasMore = signal(false);

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    this.api.listAudit(this.page() * PAGE_SIZE, PAGE_SIZE + 1).subscribe({
      next: rows => {
        this.hasMore.set(rows.length > PAGE_SIZE);
        this.entries.set(rows.slice(0, PAGE_SIZE));
        this.loading.set(false);
      },
      error: () => { this.error.set('Impossible de charger le journal.'); this.loading.set(false); },
    });
  }

  prev() { if (this.page() > 0) { this.page.update(p => p - 1); this.load(); } }
  next() { if (this.hasMore()) { this.page.update(p => p + 1); this.load(); } }

  label(action: string) { return AUDIT_LABELS[action] ?? action; }

  detail(a: AdminAuditEntry): string {
    const d = a.details ?? {};
    const lim = (v: any) => v === null || v === undefined ? 'limite du plan' : v === -1 ? 'illimité' : `${v}/jour`;
    switch (a.action) {
      case 'quota': return `${lim(d['before'])} → ${lim(d['after'])}`;
      case 'plan':  return `${d['before']} → ${d['after']}`;
      case 'role':  return `${d['before']} → ${d['after']}`;
      case 'block': return [d['days'] ? `${d['days']} jour(s)` : 'Sans échéance', d['reason'] ? `motif : ${d['reason']}` : ''].filter(Boolean).join(' · ');
      case 'auto_unblock': return d['reason'] ? `Suspension initiale : ${d['reason']}` : '';
      case 'delete_conversations': return `${d['count']} conversation(s)`;
      case 'delete_user': return d['name'] ? `Compte de ${d['name']}` : '';
      default: return '';
    }
  }

  isSensitive(action: string) { return ['block', 'delete_user', 'delete_conversations', 'role'].includes(action); }

  date(iso: string) {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }
}

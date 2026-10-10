import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminSubscription } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-subscriptions',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-subscriptions.html',
  styleUrl: './admin-subscriptions.scss',
})
export class AdminSubscriptions implements OnInit {
  private svc = inject(AdminService);

  subscriptions = signal<AdminSubscription[]>([]);
  isLoading     = signal(true);

  statusFilter = '';
  planFilter   = '';

  readonly STATUS_OPTIONS = [
    { id: '',           label: 'Tous les statuts' },
    { id: 'active',     label: 'Actif' },
    { id: 'cancelled',  label: 'Annulé' },
    { id: 'expired',    label: 'Expiré' },
  ];

  readonly PLAN_OPTIONS = [
    { id: '',           label: 'Tous les plans' },
    { id: 'basic',      label: 'Basic' },
    { id: 'pro',        label: 'Pro' },
    { id: 'enterprise', label: 'Enterprise' },
  ];

  // Stats
  get totalActive(): number  { return this.subscriptions().filter(s => s.status === 'active').length; }
  get totalPro(): number     { return this.subscriptions().filter(s => s.plan_id === 'pro').length; }
  get totalEnterprise(): number { return this.subscriptions().filter(s => s.plan_id === 'enterprise').length; }

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.svc.getSubscriptions({
      status_filter: this.statusFilter || undefined,
      plan_filter:   this.planFilter   || undefined,
    }).subscribe({
      next: subs => { this.subscriptions.set(subs); this.isLoading.set(false); },
      error: ()  => { this.isLoading.set(false); },
    });
  }

  planLabel(id: string): string {
    return { basic: 'Basic', pro: 'Pro', enterprise: 'Enterprise' }[id] ?? id;
  }

  planColor(id: string): string {
    return { basic: '#2196f3', pro: '#6c63ff', enterprise: '#ff9800' }[id] ?? '#888';
  }

  statusColor(status: string): string {
    return { active: 'var(--success)', cancelled: 'var(--danger)', expired: 'var(--text-muted)' }[status] ?? 'var(--text-muted)';
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('fr-GN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}

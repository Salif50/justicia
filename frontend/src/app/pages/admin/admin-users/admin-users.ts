import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Subject, debounceTime } from 'rxjs';
import {
  AdminService, AdminUserDetail, AdminUserSummary, UserListQuery,
} from '../../../services/admin.service';
import { Auth } from '../../../services/auth';
import { PROFILE_TYPES } from '../../../shared/profile-types';
import { DOMAINS, SOURCES, USAGES, choiceLabel } from '../../../shared/survey-options';
import { environment } from '../../../../environments/environment';

type Tab = 'overview' | 'quota' | 'activity' | 'moderation' | 'audit';
type QuotaMode = 'plan' | 'custom' | 'unlimited';

interface Confirm {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  /** Si défini, l'admin doit saisir ce texte exact pour confirmer. */
  typeToConfirm?: string;
  run: () => void;
}

const PAGE_SIZE = 25;

export const AGENT_LABELS: Record<string, string> = {
  jurisprudence: 'Assistant général', matrimonial: 'Droit de la famille', penal: 'Droit pénal',
  commercial: 'Droit des affaires', travail: 'Droit du travail', immobilier: 'Foncier & immobilier',
};

export const AUDIT_LABELS: Record<string, string> = {
  quota: 'Quota journalier modifié', reset_quota: 'Compteur du jour réinitialisé', plan: 'Plan modifié',
  block: 'Compte suspendu', unblock: 'Compte réactivé', auto_unblock: 'Suspension levée à échéance', role: 'Rôle modifié', notes: 'Notes internes mises à jour',
  delete_conversations: 'Conversations supprimées', delete_user: 'Compte supprimé',
};

@Component({
  selector: 'app-admin-users',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-users.html',
  styleUrl: './admin-users.scss',
})
export class AdminUsers implements OnInit, OnDestroy {
  private api   = inject(AdminService);
  private auth  = inject(Auth);
  private http  = inject(HttpClient);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  // ── Liste ────────────────────────────────────────────────────────────────
  readonly users    = signal<AdminUserSummary[]>([]);
  readonly total    = signal(0);
  readonly counts   = signal({ all: 0, blocked: 0, admins: 0 });
  readonly loading  = signal(true);
  readonly error    = signal('');
  readonly toast    = signal('');

  readonly q      = signal('');
  readonly status = signal<'all' | 'active' | 'blocked'>('all');
  readonly plan   = signal('');
  readonly role   = signal('');
  readonly sort   = signal<'recent' | 'last_login' | 'questions'>('recent');
  readonly page   = signal(0);

  readonly pageLabel = computed(() => {
    const start = this.total() ? this.page() * PAGE_SIZE + 1 : 0;
    return `${start}–${Math.min((this.page() + 1) * PAGE_SIZE, this.total())} sur ${this.total()}`;
  });
  readonly hasNext = computed(() => (this.page() + 1) * PAGE_SIZE < this.total());

  private search$ = new Subject<void>();

  // ── Fiche ────────────────────────────────────────────────────────────────
  readonly detail        = signal<AdminUserDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly tab           = signal<Tab>('overview');
  readonly busy          = signal(false);

  quotaMode: QuotaMode = 'plan';
  quotaValue = 20;
  planChoice = 'gratuit';
  planMonths = 12;
  blockReason = '';
  blockDays: number | null = 7;
  notifyUser = true;
  notes = '';

  readonly confirm = signal<Confirm | null>(null);
  confirmText = '';

  readonly myId = computed(() => this.auth.user()?.id);
  readonly activityMax = computed(() => Math.max(1, ...(this.detail()?.activity ?? []).map(a => a.count)));

  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview',   label: 'Aperçu' },
    { key: 'quota',      label: 'Quota & plan' },
    { key: 'activity',   label: 'Activité' },
    { key: 'moderation', label: 'Modération' },
    { key: 'audit',      label: 'Journal' },
  ];

  ngOnInit() {
    this.search$.pipe(debounceTime(300)).subscribe(() => { this.page.set(0); this.load(); });
    this.load();
    const open = this.route.snapshot.queryParamMap.get('user');
    if (open) this.openUser(open);
  }

  ngOnDestroy() { this.search$.complete(); }

  // ── Chargement liste ────────────────────────────────────────────────────
  load() {
    this.loading.set(true);
    this.error.set('');
    const query: UserListQuery = {
      q: this.q(), status: this.status(), plan: this.plan(), role: this.role(), sort: this.sort(),
      skip: this.page() * PAGE_SIZE, limit: PAGE_SIZE,
    };
    this.api.listUsers(query).subscribe({
      next: r => { this.users.set(r.items); this.total.set(r.total); this.counts.set(r.counts); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger les utilisateurs.'); this.loading.set(false); },
    });
  }

  onSearch(value: string) { this.q.set(value); this.search$.next(); }
  setFilter(key: string, value: string) {
    const target = (this as unknown as Record<string, { set?: (v: string) => void }>)[key];
    target?.set?.(value);
    this.page.set(0);
    this.load();
  }
  prevPage() { if (this.page() > 0) { this.page.update(p => p - 1); this.load(); } }
  nextPage() { if (this.hasNext()) { this.page.update(p => p + 1); this.load(); } }

  exportCsv() {
    this.http.get(`${environment.apiUrl}/admin/export/users`, { responseType: 'blob' }).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: 'utilisateurs-justicia.csv' });
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  // ── Fiche utilisateur ───────────────────────────────────────────────────
  openUser(id: string, tab: Tab = 'overview') {
    this.tab.set(tab);
    this.detailLoading.set(true);
    this.detail.set(null);
    this.router.navigate([], { queryParams: { user: id }, queryParamsHandling: 'merge', replaceUrl: true });
    this.fetchDetail(id);
  }

  private fetchDetail(id: string) {
    this.api.getUserDetail(id).subscribe({
      next: d => { this.applyDetail(d); this.detailLoading.set(false); },
      error: () => { this.detailLoading.set(false); this.closeUser(); this.flash('Fiche introuvable.'); },
    });
  }

  private applyDetail(d: AdminUserDetail) {
    this.detail.set(d);
    this.quotaMode = !d.is_override ? 'plan' : d.daily_limit === -1 ? 'unlimited' : 'custom';
    this.quotaValue = d.is_override && d.daily_limit > 0 ? d.daily_limit : Math.max(d.plan_limit, 20);
    this.planChoice = d.plan_id ?? 'gratuit';
    this.notes = d.admin_notes ?? '';
    this.blockReason = '';
    this.blockDays = 7;
  }

  closeUser() {
    this.detail.set(null);
    this.detailLoading.set(false);
    this.router.navigate([], { queryParams: { user: null }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Recharge la fiche ouverte et la ligne correspondante dans la liste. */
  private refresh(message: string) {
    const d = this.detail();
    this.flash(message);
    this.load();
    if (d) this.fetchDetail(d.id);
  }

  private act<T>(obs: import('rxjs').Observable<T>, message: string, after?: () => void) {
    this.busy.set(true);
    obs.subscribe({
      next: () => { this.busy.set(false); after?.(); this.refresh(message); },
      error: err => { this.busy.set(false); this.flash(err.error?.detail || 'Action impossible.'); },
    });
  }

  // Quota
  saveQuota() {
    const d = this.detail()!;
    const value = this.quotaMode === 'plan' ? null : this.quotaMode === 'unlimited' ? -1 : Math.max(0, Math.round(this.quotaValue));
    this.act(this.api.setUserQuota(d.id, value, this.notifyUser), value === null ? 'Quota ramené à la limite du plan.' : 'Quota journalier mis à jour.');
  }

  resetCounter() {
    const d = this.detail()!;
    this.act(this.api.resetUserQuota(d.id, this.notifyUser), 'Compteur du jour remis à zéro.');
  }

  savePlan() {
    const d = this.detail()!;
    const name = d.available_plans.find(p => p.plan_id === this.planChoice)?.name ?? this.planChoice;
    this.ask({
      title: 'Changer de plan',
      message: `${d.name} passera au plan « ${name} »${this.planChoice !== 'gratuit' ? ` pour ${this.planMonths} mois` : ''}. L'abonnement actif sera clôturé.`,
      confirmLabel: 'Appliquer',
      run: () => this.act(this.api.setUserPlan(d.id, this.planChoice, this.planMonths, this.notifyUser), `Plan « ${name} » appliqué.`),
    });
  }

  // Modération
  suspend() {
    const d = this.detail()!;
    if (!this.blockReason.trim()) { this.flash('Indiquez le motif de la suspension.'); return; }
    this.ask({
      title: 'Suspendre ce compte',
      message: `${d.name} sera déconnecté immédiatement ${this.blockDays ? `pendant ${this.blockDays} jour${this.blockDays > 1 ? 's' : ''}, puis réactivé automatiquement` : 'sans échéance, jusqu\'à réactivation manuelle'}. Le motif lui sera affiché${this.notifyUser ? ' et envoyé par e-mail' : ''}.`,
      confirmLabel: 'Suspendre', danger: true,
      run: () => this.act(
        this.api.setUserBlocked(d.id, true, { reason: this.blockReason.trim(), durationDays: this.blockDays, notify: this.notifyUser }),
        'Compte suspendu.'),
    });
  }

  reactivate() {
    const d = this.detail()!;
    this.act(this.api.setUserBlocked(d.id, false, { notify: this.notifyUser }), 'Compte réactivé.');
  }

  toggleRole() {
    const d = this.detail()!;
    const toAdmin = d.role !== 'admin';
    this.ask({
      title: toAdmin ? 'Donner les droits administrateur' : 'Retirer les droits administrateur',
      message: toAdmin
        ? `${d.name} aura accès à toute l'administration : utilisateurs, contenus, paramètres.`
        : `${d.name} redeviendra un utilisateur standard.`,
      confirmLabel: toAdmin ? 'Promouvoir' : 'Rétrograder', danger: toAdmin,
      run: () => this.act(this.api.setUserRole(d.id, toAdmin ? 'admin' : 'user'), 'Rôle mis à jour.'),
    });
  }

  saveNotes() {
    const d = this.detail()!;
    this.act(this.api.setUserNotes(d.id, this.notes), 'Notes enregistrées.');
  }

  deleteConversations() {
    const d = this.detail()!;
    this.ask({
      title: 'Supprimer toutes les conversations',
      message: `Les ${d.conversations_count} conversation(s) de ${d.name} seront définitivement effacées.`,
      confirmLabel: 'Supprimer', danger: true,
      run: () => this.act(this.api.deleteUserConversations(d.id), 'Conversations supprimées.'),
    });
  }

  deleteAccount() {
    const d = this.detail()!;
    this.ask({
      title: 'Supprimer définitivement le compte',
      message: 'Profil, conversations, dossiers, documents et abonnements seront effacés. Cette action est irréversible.',
      confirmLabel: 'Supprimer le compte', danger: true, typeToConfirm: d.email,
      run: () => {
        this.busy.set(true);
        this.api.deleteUser(d.id).subscribe({
          next: () => { this.busy.set(false); this.closeUser(); this.flash('Compte supprimé.'); this.load(); },
          error: err => { this.busy.set(false); this.flash(err.error?.detail || 'Suppression impossible.'); },
        });
      },
    });
  }

  // ── Confirmation ────────────────────────────────────────────────────────
  ask(c: Confirm) { this.confirmText = ''; this.confirm.set(c); }
  cancelConfirm() { this.confirm.set(null); }
  runConfirm() {
    const c = this.confirm();
    if (!c || (c.typeToConfirm && this.confirmText.trim() !== c.typeToConfirm)) return;
    this.confirm.set(null);
    c.run();
  }

  // ── Affichage ───────────────────────────────────────────────────────────
  private flash(msg: string) {
    this.toast.set(msg);
    setTimeout(() => { if (this.toast() === msg) this.toast.set(''); }, 3500);
  }

  initial(name: string) { return (name || '?').trim().charAt(0).toUpperCase(); }

  profileLabel(key: string | null) {
    return key ? PROFILE_TYPES.find(p => p.key === key)?.label ?? key : '—';
  }

  domainLabels(keys: string[] | undefined) { return (keys ?? []).map(k => choiceLabel(DOMAINS, k)); }
  usageLabel(key: string | undefined) { return choiceLabel(USAGES, key); }
  sourceLabel(key: string | undefined) { return choiceLabel(SOURCES, key); }
  agentLabel(id: string) { return AGENT_LABELS[id] ?? id; }
  auditLabel(action: string) { return AUDIT_LABELS[action] ?? action; }

  auditDetail(a: { action: string; details: Record<string, any> | null }): string {
    const d = a.details ?? {};
    const lim = (v: any) => v === null || v === undefined ? 'limite du plan' : v === -1 ? 'illimité' : `${v}/jour`;
    switch (a.action) {
      case 'quota': return `${lim(d['before'])} → ${lim(d['after'])}`;
      case 'plan':  return `${d['before']} → ${d['after']}${d['after'] !== 'gratuit' ? ` (${d['months']} mois)` : ''}`;
      case 'role':  return `${d['before']} → ${d['after']}`;
      case 'block': return [d['days'] ? `${d['days']} jour(s)` : 'Sans échéance', d['reason'] ? `motif : ${d['reason']}` : ''].filter(Boolean).join(' · ');
      case 'auto_unblock': return d['reason'] ? `Suspension initiale : ${d['reason']}` : '';
      case 'delete_conversations': return `${d['count']} conversation(s)`;
      default: return '';
    }
  }

  limitLabel(u: { daily_limit: number }) { return u.daily_limit === -1 ? '∞' : String(u.daily_limit); }

  quotaPercent(u: { daily_limit: number; questions_today: number }) {
    if (u.daily_limit === -1) return 0;
    if (u.daily_limit === 0) return 100;
    return Math.min(100, Math.round((u.questions_today / u.daily_limit) * 100));
  }

  relative(iso: string | null): string {
    if (!iso) return 'Jamais';
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 60) return 'À l\'instant';
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 30) return `Il y a ${Math.floor(diff / 86400)} j`;
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(iso));
  }

  readonly blockDurations: { days: number | null; label: string }[] = [
    { days: 1, label: '24 heures' }, { days: 3, label: '3 jours' }, { days: 7, label: '7 jours' },
    { days: 30, label: '30 jours' }, { days: null, label: 'Sans échéance' },
  ];

  date(iso: string | null, withTime = false): string {
    if (!iso) return '—';
    return new Intl.DateTimeFormat('fr-FR', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'long' })
      .format(new Date(iso));
  }

  shortDay(iso: string) {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(iso));
  }
}

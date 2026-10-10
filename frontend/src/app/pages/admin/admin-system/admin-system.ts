import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AdminService, SystemConfig, TopUser, RecentLogin, QuotaAlert } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-system',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './admin-system.html',
  styleUrl: './admin-system.scss',
})
export class AdminSystem implements OnInit {
  private svc = inject(AdminService);

  isLoading  = signal(true);
  saveStatus = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // System config (editable)
  maintenance  = { enabled: false, message: 'Maintenance en cours. Retour prévu dans quelques minutes.' };
  announcement = { enabled: false, message: '', type: 'info' };
  limits       = { max_questions_free: 5, max_questions_basic: 10, max_questions_pro: -1, max_questions_enterprise: -1 };

  // Activity
  topUsers    = signal<TopUser[]>([]);
  recentLogins = signal<RecentLogin[]>([]);
  quotaAlerts  = signal<QuotaAlert[]>([]);
  activityDays = 7;

  readonly ANNOUNCEMENT_TYPES = [
    { id: 'info',    label: 'Information',  color: 'var(--text-primary)' },
    { id: 'warning', label: 'Avertissement', color: 'var(--accent)' },
    { id: 'success', label: 'Succès',        color: 'var(--success)' },
    { id: 'danger',  label: 'Danger',        color: 'var(--danger)' },
  ];

  ngOnInit() {
    this.svc.getSystemConfig().subscribe({
      next: cfg => {
        this.maintenance  = { ...cfg.maintenance };
        this.announcement = { ...cfg.announcement };
        this.limits       = {
          max_questions_free:       cfg.global_limits.max_questions_free,
          max_questions_basic:      cfg.global_limits.max_questions_basic,
          max_questions_pro:        cfg.global_limits.max_questions_pro,
          max_questions_enterprise: cfg.global_limits.max_questions_enterprise ?? -1,
        };
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });

    this.loadActivity();
  }

  loadActivity() {
    this.svc.getTopUsers(this.activityDays).subscribe(u => this.topUsers.set(u));
    this.svc.getRecentLogins().subscribe(l => this.recentLogins.set(l));
    this.svc.getQuotaAlerts().subscribe(a => this.quotaAlerts.set(a));
  }

  saveMaintenance() {
    this.saveStatus.set('saving');
    this.svc.setMaintenance(this.maintenance.enabled, this.maintenance.message).subscribe({
      next: () => { this.saveStatus.set('saved'); setTimeout(() => this.saveStatus.set('idle'), 2000); },
      error: () => this.saveStatus.set('error'),
    });
  }

  saveAnnouncement() {
    this.saveStatus.set('saving');
    this.svc.setAnnouncement(this.announcement).subscribe({
      next: () => { this.saveStatus.set('saved'); setTimeout(() => this.saveStatus.set('idle'), 2000); },
      error: () => this.saveStatus.set('error'),
    });
  }

  saveLimits() {
    this.saveStatus.set('saving');
    this.svc.setGlobalLimits({
      max_free:       this.limits.max_questions_free,
      max_basic:      this.limits.max_questions_basic,
      max_pro:        this.limits.max_questions_pro,
      max_enterprise: this.limits.max_questions_enterprise,
    }).subscribe({
      next: () => { this.saveStatus.set('saved'); setTimeout(() => this.saveStatus.set('idle'), 2000); },
      error: () => this.saveStatus.set('error'),
    });
  }

  exportUsers() { window.open(this.svc.exportUsers(), '_blank'); }
  exportConversations() { window.open(this.svc.exportConversations(), '_blank'); }

  announcementColor(): string {
    return this.ANNOUNCEMENT_TYPES.find(t => t.id === this.announcement.type)?.color ?? 'var(--text-primary)';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-GN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

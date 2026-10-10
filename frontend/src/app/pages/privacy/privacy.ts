import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { ConversationHistoryService } from '../../services/conversation-history';

type Tab = 'politique' | 'droits' | 'controles';

@Component({
  selector: 'app-confidentialite',
  imports: [CommonModule, RouterLink],
  templateUrl: './privacy.html',
  styleUrl: './privacy.scss',
})
export class Privacy implements OnInit {
  activeTab = signal<Tab>('politique');

  // Préférences de confidentialité en direct
  ephemeralMode    = signal(false);
  shareAnalytics   = signal(true);
  showOnlineStatus = signal(true);

  isLoadingPrefs = signal(true);
  isSaving       = signal(false);
  actionSuccess  = signal('');
  actionError    = signal('');

  // Actions RGPD
  showDeleteConfirm = signal(false);
  isDeleting        = signal(false);

  constructor(
    private auth: Auth,
    private svc: ConversationHistoryService,
  ) {}

  ngOnInit() {
    this.loadPrefs();
  }

  private loadPrefs() {
    this.svc.getPreferences().subscribe({
      next: (p) => {
        if (p) {
          this.ephemeralMode.set(p.ephemeral_mode ?? false);
          this.shareAnalytics.set(p.share_analytics ?? true);
          this.showOnlineStatus.set(p.show_online_status ?? true);
        }
        this.isLoadingPrefs.set(false);
      },
      error: () => this.isLoadingPrefs.set(false),
    });
  }

  togglePref(field: 'ephemeral_mode' | 'share_analytics' | 'show_online_status', value: boolean) {
    if (field === 'ephemeral_mode') this.ephemeralMode.set(value);
    if (field === 'share_analytics') this.shareAnalytics.set(value);
    if (field === 'show_online_status') this.showOnlineStatus.set(value);

    this.isSaving.set(true);
    this.svc.updatePreferences({ [field]: value }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.actionSuccess.set('Préférence mise à jour');
        setTimeout(() => this.actionSuccess.set(''), 2500);
      },
      error: () => {
        this.isSaving.set(false);
        this.actionError.set('Erreur lors de la mise à jour');
      },
    });
  }

  deleteHistory() {
    this.showDeleteConfirm.set(false);
    this.isDeleting.set(true);
    this.svc.deleteAllConversations().subscribe({
      next: (res) => {
        this.isDeleting.set(false);
        this.actionSuccess.set(`Historique supprimé (${res?.deleted || 0} conversation(s))`);
        setTimeout(() => this.actionSuccess.set(''), 4000);
      },
      error: () => {
        this.isDeleting.set(false);
        this.actionError.set('Erreur lors de la suppression.');
      },
    });
  }

  getUserEmail(): string {
    return this.auth.user()?.email || '';
  }

  lastUpdated = new Date('2025-01-01');
}

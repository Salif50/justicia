import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';
import { ConversationHistoryService } from '../../services/conversation-history';
import { Subject, debounceTime, takeUntil } from 'rxjs';

@Component({
  selector: 'app-parametres',
  imports: [CommonModule, FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit, OnDestroy {

  // ── État ──────────────────────────────────────────────────────────────────
  isLoading   = signal(true);
  isSaving    = signal(false);
  saveSuccess = signal('');
  saveError   = signal('');

  // ── Préférences conversation ──────────────────────────────────────────────
  saveConversations   = signal(true);
  autoSaveChat        = signal(true);
  enableNotifications = signal(true);
  ephemeralMode       = signal(false);

  // ── Apparence ─────────────────────────────────────────────────────────────
  theme       = signal<'light' | 'dark' | 'auto'>('light');
  language    = signal('fr');
  compactMode = signal(false);

  // ── Sécurité ──────────────────────────────────────────────────────────────
  twoFactorAuth  = signal(false);
  sessionTimeout = signal(30);

  // ── Notifications ─────────────────────────────────────────────────────────
  emailNotifications = signal(true);
  pushNotifications  = signal(false);
  newsletter         = signal(false);

  // ── Confidentialité ───────────────────────────────────────────────────────
  shareAnalytics   = signal(true);
  showOnlineStatus = signal(true);

  // ── Actions RGPD ──────────────────────────────────────────────────────────
  showDeleteConvsConfirm = signal(false);
  isDeletingConvs        = signal(false);
  showEphemeralInfo      = signal(false);

  private destroy$  = new Subject<void>();
  private prefsSave$ = new Subject<void>();

  constructor(
    private svc: ConversationHistoryService,
    private auth: Auth,
  ) {}

  ngOnInit() {
    this.loadPreferences();

    // Sauvegarder en backend avec debounce de 800ms
    this.prefsSave$.pipe(
      debounceTime(800),
      takeUntil(this.destroy$),
    ).subscribe(() => this.saveToBackend());
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ── Chargement depuis le backend ─────────────────────────────────────────
  loadPreferences() {
    this.isLoading.set(true);
    this.svc.getPreferences().subscribe({
      next: (prefs) => {
        if (prefs) {
          this.saveConversations.set(prefs.save_conversations ?? true);
          this.autoSaveChat.set(prefs.auto_save_chat ?? true);
          this.enableNotifications.set(prefs.enable_notifications ?? true);
          this.ephemeralMode.set(prefs.ephemeral_mode ?? false);
          this.theme.set(prefs.theme ?? 'light');
          this.language.set(prefs.language ?? 'fr'); // Note: language est sur User, pas UserPreferences
          this.compactMode.set(prefs.compact_mode ?? false);
          this.twoFactorAuth.set(prefs.two_factor_auth ?? false);
          this.sessionTimeout.set(prefs.session_timeout ?? 30);
          this.emailNotifications.set(prefs.email_notifications ?? true);
          this.pushNotifications.set(prefs.push_notifications ?? false);
          this.newsletter.set(prefs.newsletter ?? false);
          this.shareAnalytics.set(prefs.share_analytics ?? true);
          this.showOnlineStatus.set(prefs.show_online_status ?? true);
        }
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  // ── Déclenchement de la sauvegarde après changement ──────────────────────
  onChange() {
    this.prefsSave$.next();
    this.saveSuccess.set('');
    this.saveError.set('');
  }

  private saveToBackend() {
    this.isSaving.set(true);
    this.svc.updatePreferences({
      save_conversations:   this.saveConversations(),
      auto_save_chat:       this.autoSaveChat(),
      enable_notifications: this.enableNotifications(),
      ephemeral_mode:       this.ephemeralMode(),
      theme:                this.theme(),
      compact_mode:         this.compactMode(),
      two_factor_auth:      this.twoFactorAuth(),
      session_timeout:      this.sessionTimeout(),
      email_notifications:  this.emailNotifications(),
      push_notifications:   this.pushNotifications(),
      newsletter:           this.newsletter(),
      share_analytics:      this.shareAnalytics(),
      show_online_status:   this.showOnlineStatus(),
    }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.saveSuccess.set('Paramètres sauvegardés');
        setTimeout(() => this.saveSuccess.set(''), 2500);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.saveError.set(err.error?.detail || 'Erreur de sauvegarde');
        setTimeout(() => this.saveError.set(''), 4000);
      },
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────
  toggleEphemeral() {
    if (!this.ephemeralMode()) {
      this.showEphemeralInfo.set(true);
    } else {
      this.ephemeralMode.set(false);
      this.onChange();
    }
  }

  confirmEphemeral() {
    this.ephemeralMode.set(true);
    this.showEphemeralInfo.set(false);
    this.onChange();
  }

  getSessionTimeoutLabel(): string {
    const t = this.sessionTimeout();
    if (t === 15)  return '15 minutes';
    if (t === 30)  return '30 minutes';
    if (t === 60)  return '1 heure';
    if (t === 120) return '2 heures';
    if (t === 0)   return 'Jamais';
    return `${t} minutes`;
  }

  // ── Actions RGPD ─────────────────────────────────────────────────────────
  deleteAllConversations() {
    this.showDeleteConvsConfirm.set(false);
    this.isDeletingConvs.set(true);
    this.svc.deleteAllConversations().subscribe({
      next: (res) => {
        this.isDeletingConvs.set(false);
        this.saveSuccess.set(`${res?.deleted || 0} conversation(s) supprimée(s).`);
        setTimeout(() => this.saveSuccess.set(''), 4000);
      },
      error: () => {
        this.isDeletingConvs.set(false);
        this.saveError.set('Erreur lors de la suppression.');
      },
    });
  }

  logout() {
    this.auth.logout();
  }
}

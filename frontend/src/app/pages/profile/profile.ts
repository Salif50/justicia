import { Component, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Auth } from '../../services/auth';
import { ConversationHistoryService } from '../../services/conversation-history';

interface Stats {
  conversations: number;
  questions: number;
  agents: number;
  documents: number;
}

@Component({
  selector: 'app-profile',
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './profile.html',
  styleUrl: './profile.scss',
})
export class Profile implements OnInit {
  name       = signal('');
  email      = signal('');
  phone      = signal('');
  birthDate  = signal('');
  profession = signal('');
  address    = signal('');
  language   = signal('fr');

  isEditing   = signal(false);
  isLoading   = signal(true);
  isSaving    = signal(false);
  saveSuccess = signal(false);
  saveError   = signal('');

  stats     = signal<Stats>({ conversations: 0, questions: 0, agents: 0, documents: 0 });
  joinDate  = signal<Date | null>(null);
  lastLogin = signal<Date | null>(null);

  // Changement de mot de passe
  showPasswordForm   = signal(false);
  currentPassword    = signal('');
  newPassword        = signal('');
  confirmPassword    = signal('');
  passwordError      = signal('');
  passwordSuccess    = signal(false);
  isChangingPassword = signal(false);

  constructor(
    private authService: Auth,
    private svc: ConversationHistoryService,
  ) {}

  ngOnInit() {
    this.loadProfile();
  }

  loadProfile() {
    this.isLoading.set(true);
    this.svc.getUserProfile().subscribe({
      next: (profile) => {
        if (!profile) { this.isLoading.set(false); return; }

        this.name.set(profile.name || '');
        this.email.set(profile.email || '');
        this.phone.set(profile.phone || '');
        this.birthDate.set(profile.birth_date || '');
        this.profession.set(profile.profession || '');
        this.address.set(profile.address || '');
        this.language.set(profile.language || 'fr');
        this.joinDate.set(profile.created_at ? new Date(profile.created_at) : null);
        this.lastLogin.set(profile.last_login ? new Date(profile.last_login) : null);

        if (profile.stats) {
          this.stats.set({
            conversations: profile.stats.conversations || 0,
            questions:     profile.stats.questions     || 0,
            agents:        profile.stats.agents        || 0,
            documents:     profile.stats.documents     || 0,
          });
        }

        // Sync localStorage pour compatibilité avec le reste de l'app
        localStorage.setItem('userName', profile.name || '');

        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  toggleEdit() {
    this.isEditing.update(v => !v);
    this.saveSuccess.set(false);
    this.saveError.set('');
  }

  saveProfile() {
    this.isSaving.set(true);
    this.saveError.set('');

    this.svc.updateUserProfile({
      name:       this.name()       || undefined,
      phone:      this.phone()      || undefined,
      birth_date: this.birthDate()  || undefined,
      profession: this.profession() || undefined,
      address:    this.address()    || undefined,
      language:   this.language()   || undefined,
    }).subscribe({
      next: (profile) => {
        this.isSaving.set(false);
        this.isEditing.set(false);
        this.saveSuccess.set(true);
        localStorage.setItem('userName', profile.name || '');
        setTimeout(() => this.saveSuccess.set(false), 3000);
      },
      error: (err) => {
        this.isSaving.set(false);
        this.saveError.set(err.error?.detail || 'Erreur lors de la sauvegarde.');
      },
    });
  }

  changePassword() {
    this.passwordError.set('');

    if (this.newPassword() !== this.confirmPassword()) {
      this.passwordError.set('Les mots de passe ne correspondent pas.');
      return;
    }
    if (this.newPassword().length < 8) {
      this.passwordError.set('Le nouveau mot de passe doit contenir au moins 8 caractères.');
      return;
    }

    this.isChangingPassword.set(true);
    this.svc.changePassword(this.currentPassword(), this.newPassword()).subscribe({
      next: () => {
        this.isChangingPassword.set(false);
        this.passwordSuccess.set(true);
        this.showPasswordForm.set(false);
        this.currentPassword.set('');
        this.newPassword.set('');
        this.confirmPassword.set('');
        setTimeout(() => this.passwordSuccess.set(false), 4000);
      },
      error: (err) => {
        this.isChangingPassword.set(false);
        this.passwordError.set(err.error?.detail || 'Erreur lors du changement de mot de passe.');
      },
    });
  }

  isGoogleAccount(): boolean {
    const user = this.authService.user();
    return user?.auth_provider === 'google';
  }

  deleteAccount() {
    if (confirm('Êtes-vous sûr de vouloir supprimer votre compte ? Cette action est irréversible.')) {
      this.authService.logout();
    }
  }
}

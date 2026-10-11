import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Header } from '../../components/header/header';

/** Demande d'un lien de réinitialisation (réponse identique que le compte existe ou non). */
@Component({
  selector: 'app-forgot-password',
  imports: [RouterLink, Header],
  styleUrl: './account.scss',
  template: `
<app-header />
<section class="auth-page" id="contenu" tabindex="-1">
  <div class="auth-layout">
    <main class="auth-form-panel">
      <div class="auth-card">
        @if (sent()) {
          <div class="verify-panel" role="status">
            <span class="verify-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
            </span>
            <h1>Vérifiez votre boîte mail</h1>
            <p>Si un compte existe pour <strong>{{ email() }}</strong>, un lien pour choisir un nouveau mot de passe vient d'être envoyé.</p>
            <p class="verify-hint">Le lien est valable 1 heure. Pensez aux courriers indésirables.</p>
            <a routerLink="/login" class="auth-back">Retour à la connexion</a>
          </div>
        } @else {
          <div class="auth-header">
            <h1>Mot de passe oublié</h1>
            <p>Indiquez l'adresse de votre compte : nous vous enverrons un lien pour en choisir un nouveau.</p>
          </div>
          <form class="auth-form" (submit)="submit($event)" novalidate>
            @if (error()) { <div class="error-message" role="alert"><span>{{ error() }}</span></div> }
            <div class="form-group">
              <label for="email"><span>Email</span></label>
              <input type="email" id="email" autocomplete="email" placeholder="votre@email.com" required
                     [value]="email()" (input)="email.set($any($event.target).value)" />
            </div>
            <button type="submit" class="btn-primary btn-submit" [disabled]="loading()">
              {{ loading() ? 'Envoi…' : 'Recevoir le lien' }}
            </button>
          </form>
          <div class="auth-footer"><p><a routerLink="/login">Retour à la connexion</a></p></div>
        }
      </div>
    </main>
  </div>
</section>`,
})
export class ForgotPassword {
  private readonly auth = inject(Auth);

  email = signal(inject(ActivatedRoute).snapshot.queryParamMap.get('email') ?? '');
  loading = signal(false);
  sent = signal(false);
  error = signal('');

  submit(event: Event): void {
    event.preventDefault();
    const email = this.email().trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Adresse e-mail invalide.');
      return;
    }
    this.error.set('');
    this.loading.set(true);
    this.auth.forgotPassword(email).subscribe({
      next: () => { this.loading.set(false); this.sent.set(true); },
      error: (err) => {
        this.loading.set(false);
        this.error.set(typeof err.error?.detail === 'string' ? err.error.detail : 'Une erreur est survenue. Réessayez.');
      },
    });
  }
}

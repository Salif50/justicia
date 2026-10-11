import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Header } from '../../components/header/header';

/** Ouverte depuis le lien reçu par e-mail : confirme l'adresse du compte. */
@Component({
  selector: 'app-verify-email',
  imports: [RouterLink, Header],
  styleUrl: './account.scss',
  template: `
<app-header />
<section class="auth-page" id="contenu" tabindex="-1">
  <div class="auth-layout">
    <main class="auth-form-panel">
      <div class="auth-card">
        <div class="verify-panel" role="status" aria-live="polite">
          @switch (state()) {
            @case ('pending') {
              <span class="verify-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
              </span>
              <h1>Confirmation en cours…</h1>
              <p>Un instant, nous vérifions votre lien.</p>
            }
            @case ('ok') {
              <span class="verify-icon is-ok" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="20 6 9 17 4 12"/></svg>
              </span>
              <h1>Adresse confirmée</h1>
              <p>Votre compte est activé. Connectez-vous pour poser votre première question.</p>
              <a routerLink="/login" [queryParams]="{ verified: 1, email: email() }" class="btn-primary btn-submit verify-login">Se connecter</a>
            }
            @default {
              <span class="verify-icon is-error" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </span>
              <h1>Lien non valide</h1>
              <p>{{ message() }}</p>
              <p class="verify-hint">Connectez-vous avec votre adresse : un bouton vous proposera d'envoyer un nouveau lien.</p>
              <a routerLink="/login" class="btn-primary btn-submit verify-login">Aller à la connexion</a>
            }
          }
        </div>
      </div>
    </main>
  </div>
</section>`,
})
export class VerifyEmail implements OnInit {
  private readonly auth = inject(Auth);
  private readonly route = inject(ActivatedRoute);

  state = signal<'pending' | 'ok' | 'error'>('pending');
  message = signal('');
  email = signal('');

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.fail('Ce lien est incomplet.');
      return;
    }
    this.auth.verifyEmail(token).subscribe({
      next: (r) => { this.email.set(r.email ?? ''); this.state.set('ok'); },
      error: (err) => this.fail(typeof err.error?.detail === 'string' ? err.error.detail : 'Ce lien est invalide ou a expiré.'),
    });
  }

  private fail(msg: string): void {
    this.message.set(msg);
    this.state.set('error');
  }
}

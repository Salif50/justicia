import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Header } from '../../components/header/header';

const RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: '8 caractères minimum', test: (p) => p.length >= 8 },
  { label: 'Une majuscule',        test: (p) => /[A-ZÀ-Ý]/.test(p) },
  { label: 'Une minuscule',        test: (p) => /[a-zß-ÿ]/.test(p) },
  { label: 'Un chiffre',           test: (p) => /\d/.test(p) },
];

/** Ouverte depuis le lien reçu par e-mail : choix d'un nouveau mot de passe. */
@Component({
  selector: 'app-reset-password',
  imports: [RouterLink, Header],
  styleUrl: './account.scss',
  template: `
<app-header />
<section class="auth-page" id="contenu" tabindex="-1">
  <div class="auth-layout">
    <main class="auth-form-panel">
      <div class="auth-card">
        <div class="auth-header">
          <h1>Nouveau mot de passe</h1>
          <p>Choisissez un mot de passe que vous n'utilisez nulle part ailleurs.</p>
        </div>
        @if (!token) {
          <div class="error-message" role="alert"><span>Ce lien est incomplet. Demandez-en un nouveau.</span></div>
          <a routerLink="/forgot-password" class="auth-back">Demander un nouveau lien</a>
        } @else {
          <form class="auth-form" (submit)="submit($event)" novalidate>
            @if (error()) {
              <div class="error-message" role="alert"><span>{{ error() }}</span></div>
              @if (expired()) { <a routerLink="/forgot-password" class="auth-back">Demander un nouveau lien</a> }
            }
            <div class="form-row">
              <div class="form-group">
                <label for="password"><span>Nouveau mot de passe</span></label>
                <input type="password" id="password" autocomplete="new-password" placeholder="••••••••" required
                       aria-describedby="pw-rules" [value]="password()" (input)="password.set($any($event.target).value)" />
                <ul class="pw-rules" id="pw-rules">
                  @for (r of rules(); track r.label) { <li [class.ok]="r.ok">{{ r.label }}</li> }
                </ul>
              </div>
              <div class="form-group">
                <label for="confirm"><span>Confirmer le mot de passe</span></label>
                <input type="password" id="confirm" autocomplete="new-password" placeholder="••••••••" required
                       [value]="confirm()" (input)="confirm.set($any($event.target).value)" />
              </div>
            </div>
            <button type="submit" class="btn-primary btn-submit" [disabled]="loading()">
              {{ loading() ? 'Enregistrement…' : 'Enregistrer le mot de passe' }}
            </button>
          </form>
        }
      </div>
    </main>
  </div>
</section>`,
})
export class ResetPassword {
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  password = signal('');
  confirm = signal('');
  loading = signal(false);
  error = signal('');
  expired = signal(false);
  readonly rules = computed(() => RULES.map((r) => ({ label: r.label, ok: r.test(this.password()) })));

  submit(event: Event): void {
    event.preventDefault();
    this.error.set('');
    this.expired.set(false);
    if (!this.rules().every((r) => r.ok)) {
      this.error.set('Le mot de passe doit contenir 8 caractères minimum, dont une majuscule, une minuscule et un chiffre.');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set('Les mots de passe ne correspondent pas.');
      return;
    }
    this.loading.set(true);
    this.auth.resetPassword(this.token!, this.password()).subscribe({
      next: (r) => this.router.navigate(['/login'], { queryParams: { reset: 1, email: r.email } }),
      error: (err) => {
        this.loading.set(false);
        const detail = err.error?.detail;
        this.error.set(typeof detail === 'string' ? detail : 'Une erreur est survenue. Réessayez.');
        this.expired.set(err.status === 400 && typeof detail === 'string' && detail.includes('Lien'));
      },
    });
  }
}

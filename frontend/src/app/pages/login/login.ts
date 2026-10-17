import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Auth } from '../../services/auth';
import { Header } from '../../components/header/header';
import { Reveal } from '../../core/reveal.directive';

@Component({
  selector: 'app-connexion',
  imports: [CommonModule, FormsModule, RouterLink, Header, Reveal],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email     = signal('');
  password  = signal('');
  error     = signal('');
  notice    = signal('');
  isLoading = signal(false);

  /** Compte non confirmé : propose de renvoyer le lien. */
  unverifiedEmail = signal('');
  resendState     = signal<'idle' | 'sending' | 'sent'>('idle');

  private returnUrl = '/dashboard';

  constructor(
    private authService: Auth,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    // Récupérer l'URL de retour si présente
    const params = this.route.snapshot.queryParams;
    this.returnUrl = params['returnUrl'] || '/dashboard';
    if (params['email']) this.email.set(String(params['email']));
    if (params['verified']) this.notice.set('Adresse e-mail confirmée. Vous pouvez maintenant vous connecter.');
    if (params['reset']) this.notice.set('Mot de passe modifié. Connectez-vous avec votre nouveau mot de passe.');
    const notice = this.authService.consumeLoginNotice();
    if (notice) this.error.set(notice);
  }

  onSubmit() {
    this.error.set('');
    this.notice.set('');
    this.unverifiedEmail.set('');
    this.resendState.set('idle');
    const email    = this.email().trim();
    const password = this.password();

    if (!email || !password) {
      this.error.set('Veuillez remplir tous les champs.');
      return;
    }

    this.isLoading.set(true);

    this.authService.login(email, password).subscribe({
      next: () => {
        // Rediriger les admins vers leur interface dédiée
        if (this.authService.isAdmin()) {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigateByUrl(this.returnUrl);
        }
      },
      error: (err) => {
        const detail = err.error?.detail;
        if (detail?.code === 'EMAIL_NOT_VERIFIED') {
          this.unverifiedEmail.set(detail.email || email);
          this.error.set(detail.message);
        } else {
          this.error.set(typeof detail === 'string' ? detail : 'Email ou mot de passe incorrect.');
        }
        this.isLoading.set(false);
      },
    });
  }

  resendVerification() {
    if (!this.unverifiedEmail() || this.resendState() !== 'idle') return;
    this.resendState.set('sending');
    this.authService.resendVerification(this.unverifiedEmail()).subscribe({
      next: () => this.resendState.set('sent'),
      error: (err) => {
        this.resendState.set('idle');
        if (typeof err.error?.detail === 'string') this.error.set(err.error.detail);
      },
    });
  }

  loginWithGoogle() {
    this.error.set('');
    this.isLoading.set(true);

    this.authService.loginWithGoogle().subscribe({
      next: () => {
        if (this.authService.isAdmin()) {
          this.router.navigate(['/admin']);
        } else {
          this.router.navigateByUrl(this.returnUrl);
        }
      },
      error: (err) => {
        const msg = err.error?.detail || err.message || 'Erreur lors de la connexion Google.';
        this.error.set(msg);
        this.isLoading.set(false);
      },
    });
  }
}

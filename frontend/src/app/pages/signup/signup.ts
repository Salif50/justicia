import { Component, HostListener, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth, isSignupPending } from '../../services/auth';
import { Header } from '../../components/header/header';
import { Captcha } from '../../components/captcha/captcha';
import { Reveal } from '../../core/reveal.directive';
import { environment } from '../../../environments/environment';

/** Mêmes règles que le serveur (validate_password_strength). */
const PASSWORD_RULES: { label: string; test: (p: string) => boolean }[] = [
  { label: '8 caractères minimum', test: (p) => p.length >= 8 },
  { label: 'Une majuscule',        test: (p) => /[A-ZÀ-Ý]/.test(p) },
  { label: 'Une minuscule',        test: (p) => /[a-zß-ÿ]/.test(p) },
  { label: 'Un chiffre',           test: (p) => /\d/.test(p) },
];

@Component({
  selector: 'app-inscription',
  imports: [CommonModule, FormsModule, RouterLink, Header, Captcha, Reveal],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup implements OnDestroy {
  name            = signal('');
  email           = signal('');
  password        = signal('');
  confirmPassword = signal('');
  acceptTerms     = signal(false);
  error           = signal('');
  isLoading       = signal(false);
  showTermsModal  = signal(false);

  /** Champ piège anti-robots : invisible pour un humain, doit rester vide. */
  website         = signal('');
  captchaToken    = signal('');
  readonly captchaEnabled = !!environment.turnstileSiteKey;

  /** Inscription enregistrée : adresse à confirmer. */
  pendingEmail    = signal('');
  resendState     = signal<'idle' | 'sending' | 'sent'>('idle');
  resendCooldown  = signal(0);

  readonly rules = computed(() => PASSWORD_RULES.map((r) => ({ label: r.label, ok: r.test(this.password()) })));
  readonly passwordValid = computed(() => this.rules().every((r) => r.ok));

  @ViewChild(Captcha) private captcha?: Captcha;
  private readonly openedAt = Date.now();
  private cooldownTimer?: ReturnType<typeof setInterval>;

  constructor(
    private authService: Auth,
    private router: Router,
  ) {}

  onSubmit() {
    this.error.set('');

    const name            = this.name().trim();
    const email           = this.email().trim();
    const password        = this.password();
    const confirmPassword = this.confirmPassword();

    if (!name || !email || !password || !confirmPassword) {
      this.error.set('Veuillez remplir tous les champs.');
      return;
    }
    if (!this.passwordValid()) {
      this.error.set('Le mot de passe doit contenir 8 caractères minimum, dont une majuscule, une minuscule et un chiffre.');
      return;
    }
    if (password !== confirmPassword) {
      this.error.set('Les mots de passe ne correspondent pas.');
      return;
    }
    if (!this.acceptTerms()) {
      this.error.set("Veuillez accepter les conditions d'utilisation.");
      return;
    }
    if (this.captchaEnabled && !this.captchaToken()) {
      this.error.set('Merci de valider la vérification anti-robot.');
      return;
    }

    this.isLoading.set(true);

    this.authService.signUp(name, email, password, {
      website: this.website(),
      elapsed_ms: Date.now() - this.openedAt,
      captcha_token: this.captchaToken() || undefined,
    }).subscribe({
      next: (resp) => {
        if (isSignupPending(resp)) {
          this.isLoading.set(false);
          this.pendingEmail.set(resp.email);
          this.startCooldown();
          return;
        }
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const msg = err.error?.detail || "Erreur lors de l'inscription. Veuillez réessayer.";
        this.error.set(typeof msg === 'string' ? msg : "Erreur lors de l'inscription. Veuillez réessayer.");
        this.isLoading.set(false);
        this.captcha?.reset();
      },
    });
  }

  resendLink() {
    if (this.resendCooldown() > 0 || this.resendState() === 'sending') return;
    this.resendState.set('sending');
    this.authService.resendVerification(this.pendingEmail()).subscribe({
      next: () => { this.resendState.set('sent'); this.startCooldown(); },
      error: () => { this.resendState.set('idle'); },
    });
  }

  private startCooldown() {
    this.resendCooldown.set(60);
    clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      this.resendCooldown.update((s) => Math.max(0, s - 1));
      if (this.resendCooldown() === 0) clearInterval(this.cooldownTimer);
    }, 1000);
  }

  signUpWithGoogle() {
    if (!this.acceptTerms()) {
      this.error.set("Veuillez accepter les conditions d'utilisation.");
      return;
    }
    this.error.set('');
    this.isLoading.set(true);

    this.authService.loginWithGoogle('signup').subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const msg = err.error?.detail || err.message || 'Erreur lors de l\'inscription Google.';
        this.error.set(msg);
        this.isLoading.set(false);
      },
    });
  }

  openTermsModal() {
    this.showTermsModal.set(true);
    document.body.style.overflow = 'hidden';
  }

  closeTermsModal() {
    this.showTermsModal.set(false);
    document.body.style.overflow = '';
  }

  /** Échap ferme le modal CGU. */
  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.showTermsModal()) this.closeTermsModal();
  }

  ngOnDestroy() {
    document.body.style.overflow = '';
  }
}

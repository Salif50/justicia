import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../../services/auth';
import { Header } from '../../components/header/header';

@Component({
  selector: 'app-inscription',
  imports: [CommonModule, FormsModule, RouterLink, Header],
  templateUrl: './signup.html',
  styleUrl: './signup.scss',
})
export class Signup {
  name            = signal('');
  email           = signal('');
  password        = signal('');
  confirmPassword = signal('');
  acceptTerms     = signal(false);
  error           = signal('');
  isLoading       = signal(false);
  showTermsModal  = signal(false);

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

    if (password !== confirmPassword) {
      this.error.set('Les mots de passe ne correspondent pas.');
      return;
    }

    if (password.length < 6) {
      this.error.set('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    if (!this.acceptTerms()) {
      this.error.set("Veuillez accepter les conditions d'utilisation.");
      return;
    }

    this.isLoading.set(true);

    this.authService.signUp(name, email, password).subscribe({
      next: () => {
        this.router.navigate(['/dashboard']);
      },
      error: (err) => {
        const msg = err.error?.detail || "Erreur lors de l'inscription. Veuillez réessayer.";
        this.error.set(msg);
        this.isLoading.set(false);
      },
    });
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
  }

  closeTermsModal() {
    this.showTermsModal.set(false);
  }
}

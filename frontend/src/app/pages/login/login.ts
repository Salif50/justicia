import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { Auth } from '../../services/auth';
import { Header } from '../../components/header/header';

@Component({
  selector: 'app-connexion',
  imports: [CommonModule, FormsModule, RouterLink, Header],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  email     = signal('');
  password  = signal('');
  error     = signal('');
  isLoading = signal(false);

  private returnUrl = '/dashboard';

  constructor(
    private authService: Auth,
    private router: Router,
    private route: ActivatedRoute,
  ) {
    // Récupérer l'URL de retour si présente
    this.returnUrl = this.route.snapshot.queryParams['returnUrl'] || '/dashboard';
    const notice = this.authService.consumeLoginNotice();
    if (notice) this.error.set(notice);
  }

  onSubmit() {
    this.error.set('');
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
        const msg = err.error?.detail || 'Email ou mot de passe incorrect.';
        this.error.set(msg);
        this.isLoading.set(false);
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

import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '../services/auth';

/**
 * Guest guard — protège les pages réservées aux visiteurs non connectés
 * (connexion, inscription). Si l'utilisateur est déjà authentifié,
 * il est redirigé vers le dashboard.
 */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(Auth);
  const router      = inject(Router);

  if (!authService.isLoggedIn()) {
    return true;
  }

  router.navigate(['/dashboard']);
  return false;
};

import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '../../services/auth';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(Auth);
  const router      = inject(Router);

  if (!authService.isLoggedIn()) {
    authService.handleSessionExpired(state.url);
    return false;
  }

  if (authService.isAdmin()) {
    return true;
  }

  // Connecté mais pas admin → renvoyer sur le dashboard
  router.navigate(['/dashboard']);
  return false;
};

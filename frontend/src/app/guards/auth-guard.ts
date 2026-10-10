import { CanActivateFn } from '@angular/router';
import { inject } from '@angular/core';
import { Auth } from '../services/auth';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(Auth);

  if (!authService.isLoggedIn()) {
    authService.handleSessionExpired(state.url);
    return false;
  }

  return true;
};

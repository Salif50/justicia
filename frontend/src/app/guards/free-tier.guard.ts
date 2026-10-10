import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { map } from 'rxjs/operators';
import { of } from 'rxjs';
import { FeatureService } from '../services/feature.service';

const FREE_ALLOWED_PREFIXES = [
  '/dashboard/chat',
  '/dashboard/history',
  '/dashboard/subscription',
];

function isFreeRouteAllowed(url: string): boolean {
  const path = url.split('?')[0].replace(/\/$/, '');
  if (path === '/dashboard') return false;
  return FREE_ALLOWED_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Utilisateurs sans abonnement : accès limité au chat, historique et page abonnement.
 * Redirige /dashboard vers /dashboard/chat.
 */
export const freeTierGuard: CanActivateChildFn = (_route, state) => {
  const featureService = inject(FeatureService);
  const router         = inject(Router);

  const loader = featureService.isLoaded()
    ? of(void 0)
    : featureService.load().pipe(map(() => void 0));

  return loader.pipe(
    map(() => {
      if (!featureService.isFree()) return true;

      const url = state.url;
      if (isFreeRouteAllowed(url)) return true;

      router.navigate(['/dashboard/chat']);
      return false;
    }),
  );
};

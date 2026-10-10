import { HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, of, throwError } from 'rxjs';

export function isAuthError(error: unknown): boolean {
  return error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403);
}

/** Relance les erreurs 401/403 pour laisser l'intercepteur rediriger vers la connexion. */
export function catchExceptAuth<T>(fallback: T) {
  return catchError<T, Observable<T>>((error) =>
    isAuthError(error) ? throwError(() => error) : of(fallback)
  );
}

export function isProtectedApiUrl(url: string): boolean {
  const protectedPatterns = [
    '/user/',
    '/subscription/usage',
    '/subscription/current',
    '/subscription/invoices',
    '/billing/status',
    '/billing/checkout',
    '/billing/confirm',
    '/subscription/cancel',
    '/conversation/',
    '/notifications',
    '/cases',
    '/agents',
    '/archives',
    '/agenda',
    '/documents',
    '/resume',
    '/generation',
    '/admin/',
  ];
  return protectedPatterns.some((pattern) => url.includes(pattern));
}

export function isAuthAttemptUrl(url: string): boolean {
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/signup') ||
    url.includes('/auth/google') ||
    url.includes('/auth/refresh')
  );
}

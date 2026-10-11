import { HttpInterceptorFn, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, tap, throwError } from 'rxjs';
import { Auth } from '../../services/auth';
import { FeatureService } from '../../services/feature.service';
import {
  BackendStatusService,
  SERVICE_UNAVAILABLE_MESSAGE,
  isBackendUnavailable,
} from '../../services/backend-status.service';
import { isAuthAttemptUrl, isProtectedApiUrl } from '../utils/auth-error.util';

function shouldForceLogin(error: HttpErrorResponse, url: string, hadToken: boolean): boolean {
  if (isAuthAttemptUrl(url)) return false;

  if (error.status === 401 && hadToken) return true;

  if (error.status === 403) {
    return hadToken || isProtectedApiUrl(url);
  }

  return false;
}

const FIELD_LABELS: Record<string, string> = {
  email: 'Adresse e-mail',
  password: 'Mot de passe',
  name: 'Nom',
  subject: 'Sujet',
  message: 'Message',
};

/** Première erreur de validation, formulée pour l'utilisateur. */
function validationMessage(details: { loc?: (string | number)[]; msg?: string; type?: string }[]): string {
  const first = details[0] ?? {};
  const field = String(first.loc?.[first.loc.length - 1] ?? '');
  if (field === 'email') return 'Adresse e-mail invalide.';
  const label = FIELD_LABELS[field];
  if (first.type === 'string_too_short') return `${label ?? 'Un champ'} : trop court.`;
  if (first.type === 'string_too_long') return `${label ?? 'Un champ'} : trop long.`;
  const msg = (first.msg ?? '').replace(/^Value error, /, '');
  return label ? `${label} : ${msg}` : (msg || 'Certaines informations sont invalides.');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router         = inject(Router);
  const auth           = inject(Auth);
  const featureService = inject(FeatureService);
  const backendStatus  = inject(BackendStatusService);
  const token          = auth.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    tap(event => { if (event instanceof HttpResponse) backendStatus.markUp(); }),
    catchError((error: HttpErrorResponse) => {
      // Backend injoignable : on le signale (bandeau global) et on remplace
      // l'erreur brute par un message clair, repris par les pages via
      // `err.error?.detail`. Jamais de redirection vers la connexion ici.
      if (isBackendUnavailable(error)) {
        backendStatus.markDown();
        return throwError(() => new HttpErrorResponse({
          error: { detail: SERVICE_UNAVAILABLE_MESSAGE, code: 'SERVICE_UNAVAILABLE' },
          headers: error.headers,
          status: error.status,
          statusText: error.statusText,
          url: error.url ?? undefined,
        }));
      }
      if (error.status > 0 && error.status < 500) backendStatus.markUp();
      // Erreur de validation FastAPI (liste d'objets) → une phrase lisible,
      // reprise telle quelle par les pages via `err.error?.detail`
      if (error.status === 422 && Array.isArray(error.error?.detail)) {
        return throwError(() => new HttpErrorResponse({
          error: { detail: validationMessage(error.error.detail), code: 'VALIDATION_ERROR' },
          headers: error.headers,
          status: error.status,
          statusText: error.statusText,
          url: error.url ?? undefined,
        }));
      }
      if (shouldForceLogin(error, req.url, !!token)) {
        featureService.clear();
        const suspended = error.error?.detail?.code === 'ACCOUNT_SUSPENDED';
        auth.handleSessionExpired(router.url, suspended ? error.error.detail.message : undefined);
      }
      return throwError(() => error);
    })
  );
};

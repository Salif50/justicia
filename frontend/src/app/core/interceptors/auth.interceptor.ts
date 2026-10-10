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
      if (shouldForceLogin(error, req.url, !!token)) {
        featureService.clear();
        const suspended = error.error?.detail?.code === 'ACCOUNT_SUSPENDED';
        auth.handleSessionExpired(router.url, suspended ? error.error.detail.message : undefined);
      }
      return throwError(() => error);
    })
  );
};

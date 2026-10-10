import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Auth } from '../../services/auth';
import { FeatureService } from '../../services/feature.service';
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
  const token          = auth.getToken();

  const authReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (shouldForceLogin(error, req.url, !!token)) {
        featureService.clear();
        const suspended = error.error?.detail?.code === 'ACCOUNT_SUSPENDED';
        auth.handleSessionExpired(router.url, suspended ? error.error.detail.message : undefined);
      }
      return throwError(() => error);
    })
  );
};

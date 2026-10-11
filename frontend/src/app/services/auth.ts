import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, from, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';

// Typage minimal pour la Google Identity Services API
interface GooglePromptNotification {
  isNotDisplayed: () => boolean;
  isSkippedMoment: () => boolean;
  isDismissedMoment: () => boolean;
  getNotDisplayedReason?: () => string;
  getSkippedReason?: () => string;
  getDismissedReason?: () => string;
}

declare const google: {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (resp: { credential: string }) => void;
        auto_select?: boolean;
        cancel_on_tap_outside?: boolean;
        context?: 'signin' | 'signup' | 'use';
        itp_support?: boolean;
      }) => void;
      prompt: (momentListener?: (notification: GooglePromptNotification) => void) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          type?: 'standard' | 'icon';
          theme?: 'outline' | 'filled_blue' | 'filled_black';
          size?: 'large' | 'medium' | 'small';
          text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
          width?: number;
        },
      ) => void;
      cancel: () => void;
    };
  };
};

export interface UserInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  auth_provider: string;
  profile_type: string | null;
  profile_completed: boolean;
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: UserInfo;
}

/** Inscription enregistrée, adresse e-mail à confirmer avant la connexion. */
export interface SignupPending {
  verification_required: true;
  email: string;
  message: string;
}

/** Signaux anti-robots joints aux formulaires publics. */
export interface AntiBotFields {
  website?: string;        // champ piège : doit rester vide
  elapsed_ms?: number;     // durée de remplissage
  captcha_token?: string;  // Cloudflare Turnstile (si activé)
}

export interface MessageResponse {
  success: boolean;
  message: string;
  email?: string;
}

export function isSignupPending(resp: TokenResponse | SignupPending): resp is SignupPending {
  return (resp as SignupPending).verification_required === true;
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private _user    = signal<UserInfo | null>(null);
  private _loggedIn = signal(false);
  private _sessionRedirecting = false;

  private googleInitialized = false;
  private googlePending: {
    resolve: (token: string) => void;
    reject: (err: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null = null;

  readonly user    = this._user.asReadonly();
  readonly isAdmin = computed(() => this._user()?.role === 'admin');

  constructor(
    private http: HttpClient,
    private router: Router,
  ) {
    // Restaurer la session depuis le localStorage au démarrage
    const token   = localStorage.getItem('access_token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        if (this.isTokenExpired(token)) {
          this.clearSession();
          return;
        }
        const u = JSON.parse(userStr) as UserInfo;
        this._user.set(u);
        this._loggedIn.set(true);
      } catch {
        this.clearSession();
      }
    }
  }

  // ── Connexion email/mot de passe ─────────────────────────────────────────
  login(email: string, password: string): Observable<TokenResponse> {
    return this.http
      .post<TokenResponse>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap(resp => this.storeSession(resp)));
  }

  // ── Inscription ──────────────────────────────────────────────────────────
  signUp(name: string, email: string, password: string, antiBot: AntiBotFields = {}): Observable<TokenResponse | SignupPending> {
    return this.http
      .post<TokenResponse | SignupPending>(`${environment.apiUrl}/auth/signup`, { name, email, password, ...antiBot })
      .pipe(tap(resp => { if (!isSignupPending(resp)) this.storeSession(resp); }));
  }

  // ── Confirmation d'adresse et mot de passe oublié ────────────────────────
  verifyEmail(token: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/verify-email`, { token });
  }

  resendVerification(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/resend-verification`, { email });
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/forgot-password`, { email });
  }

  resetPassword(token: string, password: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${environment.apiUrl}/auth/reset-password`, { token, password });
  }

  // ── Connexion / inscription Google OAuth ─────────────────────────────────
  loginWithGoogle(mode: 'signin' | 'signup' = 'signin'): Observable<TokenResponse> {
    return from(this.waitForGoogleSdk()).pipe(
      switchMap(() => from(this.requestGoogleCredential(mode))),
      switchMap((idToken: string) =>
        this.http
          .post<TokenResponse>(`${environment.apiUrl}/auth/google`, { token: idToken })
          .pipe(tap(resp => this.storeSession(resp))),
      ),
    );
  }

  /** Attend le chargement du script GIS (async defer dans index.html). */
  private waitForGoogleSdk(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (typeof google !== 'undefined') {
        resolve();
        return;
      }
      const started = Date.now();
      const timer = setInterval(() => {
        if (typeof google !== 'undefined') {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > timeoutMs) {
          clearInterval(timer);
          reject(new Error('Le SDK Google n\'est pas chargé. Vérifiez votre connexion internet.'));
        }
      }, 80);
    });
  }

  private ensureGoogleInitialized(): void {
    if (this.googleInitialized) return;

    google.accounts.id.initialize({
      client_id: environment.googleClientId,
      callback: (response) => this.onGoogleCredential(response.credential),
      auto_select: false,
      cancel_on_tap_outside: true,
      context: 'signin',
      itp_support: true,
    });

    this.googleInitialized = true;
  }

  private onGoogleCredential(credential: string): void {
    if (!this.googlePending) return;
    clearTimeout(this.googlePending.timeoutId);
    this.googlePending.resolve(credential);
    this.googlePending = null;
  }

  private rejectGooglePending(message: string): void {
    if (!this.googlePending) return;
    clearTimeout(this.googlePending.timeoutId);
    this.googlePending.reject(new Error(message));
    this.googlePending = null;
  }

  private googleErrorMessage(reason?: string): string {
    switch (reason) {
      case 'unregistered_origin':
        return `Origine non autorisée (${window.location.origin}). Ajoutez cette URL dans la Google Cloud Console.`;
      case 'secure_http_required':
        return 'La connexion Google nécessite HTTPS ou localhost.';
      case 'suppressed_by_user':
      case 'tap_outside':
      case 'user_cancel':
        return 'Connexion Google annulée.';
      case 'browser_not_supported':
        return 'Votre navigateur ne supporte pas la connexion Google.';
      case 'invalid_client':
        return 'Configuration Google OAuth invalide (client ID).';
      default:
        return reason
          ? `Connexion Google indisponible (${reason}).`
          : 'Connexion Google annulée ou non disponible.';
    }
  }

  /**
   * Ouvre le sélecteur de compte Google via renderButton (fiable au clic utilisateur).
   * prompt() = One Tap, souvent bloqué par le navigateur — ne pas l'utiliser seul.
   */
  private requestGoogleCredential(mode: 'signin' | 'signup'): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.googlePending) {
        reject(new Error('Une connexion Google est déjà en cours.'));
        return;
      }

      this.ensureGoogleInitialized();

      const timeoutId = setTimeout(() => {
        this.rejectGooglePending('Connexion Google expirée. Réessayez.');
      }, 120_000);

      this.googlePending = { resolve, reject, timeoutId };

      const container = document.createElement('div');
      container.setAttribute('aria-hidden', 'true');
      Object.assign(container.style, {
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '1px',
        height: '1px',
        overflow: 'hidden',
        opacity: '0',
        pointerEvents: 'none',
      });
      document.body.appendChild(container);

      const cleanup = () => { container.remove(); };

      try {
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: mode === 'signup' ? 'signup_with' : 'continue_with',
          width: 280,
        });
      } catch {
        cleanup();
        this.rejectGooglePending('Impossible d\'initialiser la connexion Google.');
        return;
      }

      // Rester dans la chaîne du geste utilisateur (évite le blocage popup)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const btn = container.querySelector('[role="button"]') as HTMLElement | null;
          if (btn) {
            btn.click();
            return;
          }

          // Fallback One Tap si le bouton n'a pas pu être rendu
          cleanup();
          google.accounts.id.prompt((notification) => {
            if (notification.isNotDisplayed()) {
              const reason = notification.getNotDisplayedReason?.();
              this.rejectGooglePending(this.googleErrorMessage(reason));
            } else if (notification.isSkippedMoment()) {
              const reason = notification.getSkippedReason?.();
              this.rejectGooglePending(this.googleErrorMessage(reason));
            } else if (notification.isDismissedMoment()) {
              const reason = notification.getDismissedReason?.();
              this.rejectGooglePending(this.googleErrorMessage(reason));
            }
          });
        });
      });
    });
  }

  // ── Déconnexion ──────────────────────────────────────────────────────────
  logout(): void {
    this.rejectGooglePending('Connexion Google annulée.');
    // Annuler la session Google si active
    if (typeof google !== 'undefined') {
      try { google.accounts.id.cancel(); } catch { /* ignore */ }
    }
    this.clearSession();
  }

  // ── Statut ───────────────────────────────────────────────────────────────
  isLoggedIn(): boolean {
    const token = this.getToken();
    if (!this._loggedIn() || !token) return false;
    if (this.isTokenExpired(token)) {
      this.clearSession();
      return false;
    }
    return true;
  }

  getIsAuthenticated() {
    return this._loggedIn.asReadonly();
  }

  getToken(): string | null {
    return localStorage.getItem('access_token');
  }

  /** Vérifie l'expiration du JWT (avec marge de 30 s). */
  isTokenExpired(token = this.getToken() ?? undefined): boolean {
    if (!token) return true;
    try {
      const payloadPart = token.split('.')[1];
      if (!payloadPart) return true;
      const payload = JSON.parse(
        atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/'))
      ) as { exp?: number };
      if (typeof payload.exp !== 'number') return false;
      return Date.now() >= payload.exp * 1000 - 30_000;
    } catch {
      return true;
    }
  }

  /** Message à afficher sur l'écran de connexion (ex. compte suspendu en cours de session). */
  private _loginNotice: string | null = null;

  /** Lit puis efface le message destiné à l'écran de connexion. */
  consumeLoginNotice(): string | null {
    const notice = this._loginNotice;
    this._loginNotice = null;
    return notice;
  }

  /** Session invalide ou expirée → nettoyage + redirection vers connexion. */
  handleSessionExpired(returnUrl?: string, notice?: string): void {
    if (notice) this._loginNotice = notice;
    if (this._sessionRedirecting) return;

    const currentUrl = returnUrl ?? this.router.url;
    this.clearSession();

    if (currentUrl.startsWith('/login') || currentUrl.startsWith('/signup')) {
      return;
    }

    this._sessionRedirecting = true;
    this.router
      .navigate(['/login'], {
        queryParams: currentUrl.startsWith('/dashboard') || currentUrl.startsWith('/admin')
          ? { returnUrl: currentUrl }
          : {},
      })
      .finally(() => {
        setTimeout(() => { this._sessionRedirecting = false; }, 500);
      });
  }

  // ── Helpers privés ───────────────────────────────────────────────────────
  updateUser(partial: Partial<UserInfo>): void {
    const current = this._user();
    if (!current) return;
    const updated = { ...current, ...partial };
    this._user.set(updated);
    localStorage.setItem('user', JSON.stringify(updated));
  }

  private storeSession(resp: TokenResponse): void {
    localStorage.setItem('access_token',  resp.access_token);
    localStorage.setItem('refresh_token', resp.refresh_token);
    localStorage.setItem('user',          JSON.stringify(resp.user));
    localStorage.setItem('authToken', resp.access_token);
    localStorage.setItem('userName',  resp.user.name);
    this._user.set(resp.user);
    this._loggedIn.set(true);
  }

  private clearSession(): void {
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    localStorage.removeItem('user');
    localStorage.removeItem('authToken');
    localStorage.removeItem('userName');
    this._user.set(null);
    this._loggedIn.set(false);
  }
}

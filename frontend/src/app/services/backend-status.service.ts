import { Injectable, NgZone, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { environment } from '../../environments/environment';

/** Message unique affiché partout quand le backend ne répond pas. */
export const SERVICE_UNAVAILABLE_MESSAGE =
  'Le service est momentanément indisponible. Veuillez réessayer ultérieurement.';

/** Contrôle de santé toutes les 20 s tant que le service est indisponible. */
const RECHECK_MS = 20_000;

/**
 * Indisponibilité du backend : serveur injoignable (status 0) ou passerelle
 * qui répond à sa place (502/503/504 sans corps JSON de l'API). Un 503 émis
 * par l'API elle-même porte un `detail` : ce n'est pas une panne.
 */
export function isBackendUnavailable(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) return false;
  if (error.status === 0) return true;
  return [502, 503, 504].includes(error.status) && !error.error?.detail;
}

@Injectable({ providedIn: 'root' })
export class BackendStatusService {
  private readonly zone = inject(NgZone);

  /** true tant que le backend est jugé indisponible. */
  readonly down = signal(false);
  readonly checking = signal(false);

  private timer?: ReturnType<typeof setInterval>;
  private readonly healthUrl = environment.apiUrl.replace(/\/api\/?$/, '') + '/health';

  markDown(): void {
    if (this.down()) return;
    this.down.set(true);
    // Hors zone : un intervalle permanent bloquerait la stabilité de l'app
    this.zone.runOutsideAngular(() => {
      this.timer = setInterval(() => this.zone.run(() => this.check()), RECHECK_MS);
    });
  }

  markUp(): void {
    if (!this.down()) return;
    this.down.set(false);
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** Vérifie /health directement (fetch : ne repasse pas par l'intercepteur). */
  async check(): Promise<boolean> {
    if (this.checking()) return !this.down();
    this.checking.set(true);
    try {
      const res = await fetch(this.healthUrl, { cache: 'no-store' });
      res.ok ? this.markUp() : this.markDown();
    } catch {
      this.markDown();
    } finally {
      this.checking.set(false);
    }
    return !this.down();
  }
}

import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, output } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id?: string) => void;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { scriptPromise = null; reject(new Error('turnstile')); };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Vérification anti-robots Cloudflare Turnstile. N'affiche rien (et ne charge
 * aucun script tiers) tant que TURNSTILE_SITE_KEY n'est pas défini.
 */
@Component({
  selector: 'app-captcha',
  standalone: true,
  template: `@if (enabled) { <div #host class="captcha"></div> }`,
  styles: [`.captcha { min-height: 65px; display: flex; justify-content: center; }`],
})
export class Captcha implements AfterViewInit, OnDestroy {
  readonly token = output<string>();
  readonly enabled = !!environment.turnstileSiteKey;

  @ViewChild('host') private host?: ElementRef<HTMLElement>;
  private widgetId?: string;

  async ngAfterViewInit(): Promise<void> {
    if (!this.enabled || !this.host) return;
    try {
      await loadScript();
      this.widgetId = window.turnstile!.render(this.host.nativeElement, {
        sitekey: environment.turnstileSiteKey,
        language: 'fr',
        theme: 'light',
        callback: (t: string) => this.token.emit(t),
        'expired-callback': () => this.token.emit(''),
        'error-callback': () => this.token.emit(''),
      });
    } catch {
      this.token.emit('');
    }
  }

  /** À appeler après un envoi refusé : un jeton ne sert qu'une fois. */
  reset(): void {
    if (this.widgetId && window.turnstile) window.turnstile.reset(this.widgetId);
    this.token.emit('');
  }

  ngOnDestroy(): void {
    if (this.widgetId && window.turnstile) window.turnstile.remove(this.widgetId);
  }
}

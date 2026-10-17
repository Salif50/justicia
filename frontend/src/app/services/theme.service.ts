import { Injectable, signal, computed, effect } from '@angular/core';

export type ThemeMode = 'light' | 'dark' | 'auto';

const STORAGE_KEY = 'theme';
const META_COLORS = { light: '#FFFFFF', dark: '#0F0F0E' } as const;

/**
 * Thème clair / nuit.
 * - `mode` : préférence de l'utilisateur ('light' | 'dark' | 'auto'), persistée.
 * - 'auto' (défaut) suit `prefers-color-scheme` du système et réagit à ses changements.
 * - Applique `data-theme="light|dark"` sur <html> (le script de index.html l'a déjà
 *   posé avant le premier rendu pour éviter tout flash).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia('(prefers-color-scheme: dark)');
  private readonly systemDark = signal(this.media.matches);

  readonly mode = signal<ThemeMode>(readStoredMode());
  readonly isDark = computed(() => this.mode() === 'dark' || (this.mode() === 'auto' && this.systemDark()));
  readonly resolved = computed<'light' | 'dark'>(() => (this.isDark() ? 'dark' : 'light'));

  constructor() {
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    if (typeof this.media.addEventListener === 'function') this.media.addEventListener('change', onChange);
    else this.media.addListener(onChange);

    effect(() => {
      localStorage.setItem(STORAGE_KEY, this.mode());
      this.apply(this.resolved());
    });
  }

  setMode(mode: ThemeMode) {
    this.mode.set(mode);
  }

  /** Bascule explicite clair ↔ nuit (quitte le mode automatique). */
  toggle() {
    this.mode.set(this.isDark() ? 'light' : 'dark');
  }

  private apply(theme: 'light' | 'dark') {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme]);
  }
}

function readStoredMode(): ThemeMode {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'auto';
}

import { Injectable, PLATFORM_ID, signal, computed, effect, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

export type ThemeMode = 'light' | 'dark' | 'auto';

/** Clé renouvelée : tout le monde repart sur le mode sombre par défaut. */
const STORAGE_KEY = 'justicia-theme';
const META_COLORS = { light: '#FFFFFF', dark: '#0F0F0E' } as const;

/**
 * Thème clair / nuit.
 * - `mode` : préférence de l'utilisateur ('light' | 'dark' | 'auto'), persistée.
 * - Le mode nuit est le mode par défaut ; l'utilisateur peut choisir clair ou automatique.
 * - Applique `data-theme="light|dark"` sur <html> (le script de index.html l'a déjà
 *   posé avant le premier rendu pour éviter tout flash).
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Au pré-rendu (serveur), pas de fenêtre ni de stockage : le thème est posé par index.html dans le navigateur. */
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly media = this.browser ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  private readonly systemDark = signal(this.media?.matches ?? true);

  readonly mode = signal<ThemeMode>(this.browser ? readStoredMode() : 'dark');
  readonly isDark = computed(() => this.mode() === 'dark' || (this.mode() === 'auto' && this.systemDark()));
  readonly resolved = computed<'light' | 'dark'>(() => (this.isDark() ? 'dark' : 'light'));

  constructor() {
    if (!this.media) return;
    const onChange = (e: MediaQueryListEvent) => this.systemDark.set(e.matches);
    if (typeof this.media.addEventListener === 'function') this.media.addEventListener('change', onChange);
    else this.media.addListener(onChange);

    effect(() => {
      try { localStorage.setItem(STORAGE_KEY, this.mode()); } catch { /* stockage indisponible */ }
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
  let v: string | null = null;
  try { v = localStorage.getItem(STORAGE_KEY); } catch { /* navigation privée stricte */ }
  return v === 'light' || v === 'dark' || v === 'auto' ? v : 'dark';
}

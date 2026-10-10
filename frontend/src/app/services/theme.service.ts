import { Injectable, signal, effect } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  isDark = signal(localStorage.getItem('theme') === 'dark');

  constructor() {
    this.apply();
    effect(() => {
      localStorage.setItem('theme', this.isDark() ? 'dark' : 'light');
      this.apply();
    });
  }

  toggle() {
    this.isDark.set(!this.isDark());
  }

  private apply() {
    document.documentElement.setAttribute('data-theme', this.isDark() ? 'dark' : 'light');
  }
}

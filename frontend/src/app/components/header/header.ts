import { Component, signal, computed, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Auth } from '../../services/auth';
import { ThemeService } from '../../services/theme.service';

@Component({
  selector: 'app-header',
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class Header {
  readonly theme = inject(ThemeService);
  readonly isMenuOpen = signal(false);
  readonly isScrolled = signal(false);
  /** Avancement de lecture (0 → 1) pour le fil orange sous la barre. */
  readonly progress = signal(0);
  readonly isAuthenticated = computed(() => this.authService.isLoggedIn());
  /** Accueil : en-tête transparent et clair tant qu'on est sur le héros sombre. */
  private readonly onHome = signal(false);
  readonly isHome = computed(() => this.onHome());
  readonly overDark = computed(() => this.onHome() && !this.isScrolled() && !this.isMenuOpen());

  readonly links = [
    { path: '/',        label: 'Accueil', exact: true },
    { path: '/pricing', label: 'Tarifs',  exact: false },
    { path: '/guide',   label: 'Guide',   exact: false },
    { path: '/support', label: 'Support', exact: false },
    { path: '/terms',   label: 'Conditions', exact: false },
  ];

  constructor(private authService: Auth, router: Router) {
    const update = (url: string) => this.onHome.set(url.split(/[?#]/)[0] === '/');
    update(router.url);
    router.events.pipe(filter(e => e instanceof NavigationEnd))
      .subscribe(e => update((e as NavigationEnd).urlAfterRedirects));
  }

  @HostListener('window:scroll')
  onScroll() {
    const y = window.scrollY;
    this.isScrolled.set(y > 24);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    this.progress.set(max > 0 ? Math.min(1, y / max) : 0);
  }

  @HostListener('document:keydown.escape')
  onEscape() { if (this.isMenuOpen()) this.closeMenu(); }

  toggleMenu() {
    this.isMenuOpen.update(v => !v);
    document.body.style.overflow = this.isMenuOpen() ? 'hidden' : '';
  }

  closeMenu() {
    this.isMenuOpen.set(false);
    document.body.style.overflow = '';
  }

  pad(i: number) { return String(i + 1).padStart(2, '0'); }

  /** Lien d'évitement : déplace le focus sur le contenu de la page courante
   *  (un simple href="#contenu" renverrait vers « /#contenu », donc l'accueil). */
  skipToContent(event: Event) {
    event.preventDefault();
    const target = document.getElementById('contenu');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    target.scrollIntoView({ block: 'start' });
  }
}

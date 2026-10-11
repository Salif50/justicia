import { Component, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { Auth } from '../../services/auth';
import { ThemeService } from '../../services/theme.service';

interface NavItem { path: string; label: string; icon: string; exact?: boolean; }
interface NavGroup { label: string; items: NavItem[]; }

const ICONS: Record<string, string> = {
  grid:     '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  users:    '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  question: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  card:     '<rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>',
  mail:     '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
  shield:   '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  log:      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="13" y2="17"/>',
  bot:      '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M12 7V3M8 13h.01M16 13h.01M9 17h6"/>',
  chat:     '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  steps:    '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>',
  quote:    '<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z"/>',
  price:    '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
  faq:      '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  sliders:  '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  server:   '<rect x="2" y="2" width="20" height="8" rx="2"/><rect x="2" y="14" width="20" height="8" rx="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/>',
};

@Component({
  selector: 'app-admin-layout',
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  readonly sidebarOpen  = signal(typeof window === 'undefined' || window.innerWidth > 960);
  readonly currentRoute = signal('');

  readonly themeSvc    = inject(ThemeService);
  private authService  = inject(Auth);
  private router       = inject(Router);
  private sanitizer    = inject(DomSanitizer);

  readonly userName    = computed(() => this.authService.user()?.name || 'Administrateur');
  readonly userEmail   = computed(() => this.authService.user()?.email || '');
  readonly userInitial = computed(() => (this.authService.user()?.name || 'A')[0].toUpperCase());

  readonly nav: NavGroup[] = [
    { label: 'Pilotage', items: [
      { path: '/admin', label: 'Tableau de bord', icon: 'grid', exact: true },
    ]},
    { label: 'Utilisateurs', items: [
      { path: '/admin/users',         label: 'Utilisateurs',      icon: 'users' },
      { path: '/admin/questions',     label: 'Questions posées',  icon: 'question' },
      { path: '/admin/subscriptions', label: 'Abonnements',       icon: 'card' },
      { path: '/admin/contacts',      label: 'Messages reçus',    icon: 'mail' },
    ]},
    { label: 'Modération', items: [
      { path: '/admin/moderation',    label: 'Règles de contenu', icon: 'shield' },
      { path: '/admin/audit',         label: 'Journal des actions', icon: 'log' },
    ]},
    { label: 'Intelligence artificielle', items: [
      { path: '/admin/agents',        label: 'Agents IA',         icon: 'bot' },
      { path: '/admin/conversations', label: 'Conversations',     icon: 'chat' },
      { path: '/admin/procedures',    label: 'Démarches',         icon: 'steps' },
    ]},
    { label: 'Contenu du site', items: [
      { path: '/admin/testimonials',  label: 'Témoignages',       icon: 'quote' },
      { path: '/admin/pricing',       label: 'Tarifs & plans',    icon: 'price' },
      { path: '/admin/faq',           label: 'FAQ',               icon: 'faq' },
      { path: '/admin/config',        label: 'Configuration',     icon: 'sliders' },
    ]},
    { label: 'Système', items: [
      { path: '/admin/system',        label: 'Paramètres système', icon: 'server' },
    ]},
  ];

  private readonly titles: Record<string, string> = Object.fromEntries(
    this.nav.flatMap(g => g.items).map(i => [i.path.replace('/admin', '').replace('/', ''), i.label]),
  );

  readonly currentPageTitle = computed(() => this.titles[this.currentRoute()] ?? 'Administration');

  private readonly iconCache = new Map<string, SafeHtml>();
  icon(name: string): SafeHtml {
    if (!this.iconCache.has(name)) {
      this.iconCache.set(name, this.sanitizer.bypassSecurityTrustHtml(ICONS[name] ?? ''));
    }
    return this.iconCache.get(name)!;
  }

  constructor() {
    const section = (url: string) => url.split(/[?#]/)[0].split('/').filter(s => s)[1] ?? '';
    this.router.events
      .pipe(filter(e => e instanceof NavigationEnd))
      .subscribe((e: any) => {
        this.currentRoute.set(section(e.urlAfterRedirects));
        if (typeof window !== 'undefined' && window.innerWidth <= 960) this.sidebarOpen.set(false);
        if (typeof document !== 'undefined') document.querySelector('.adm-content')?.scrollTo(0, 0);
      });
    this.currentRoute.set(section(this.router.url));
  }

  toggleSidebar() { this.sidebarOpen.update(v => !v); }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }
}

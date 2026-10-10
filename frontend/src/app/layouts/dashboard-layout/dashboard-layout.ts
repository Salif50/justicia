import { Component, signal, computed, OnDestroy, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive, Router, NavigationEnd } from '@angular/router';
import { Auth } from '../../services/auth';
import { FeatureService } from '../../services/feature.service';
import { SearchService } from '../../services/search.service';
import { NotificationService } from '../../services/notification.service';
import { ThemeService } from '../../services/theme.service';
import { GlobalSearch } from '../../components/global-search/global-search';
import { NotificationsBell } from '../../components/notifications-bell/notifications-bell';
import { OnboardingSurvey } from '../../components/onboarding-survey/onboarding-survey';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-dashboard-layout',
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, GlobalSearch, NotificationsBell, OnboardingSurvey],
  templateUrl: './dashboard-layout.html',
  styleUrl: './dashboard-layout.scss',
})
export class DashboardLayout implements OnInit, OnDestroy {
  private authService    = inject(Auth);
  private featureService = inject(FeatureService);
  private router         = inject(Router);
  readonly searchSvc     = inject(SearchService);
  readonly notifSvc      = inject(NotificationService);
  readonly themeSvc      = inject(ThemeService);

  isSidebarOpen = signal(false);
  readonly isMobileViewport = signal(
    typeof window !== 'undefined' && window.innerWidth <= 768
  );
  currentRoute  = signal<string>('');
  // Questionnaire d'accueil : décidé une seule fois à l'arrivée (profil non complété) ;
  // il reste ouvert jusqu'à sa fermeture explicite, pour afficher son écran final.
  readonly showSurvey = signal(!!this.authService.user() && !this.authService.user()!.profile_completed);

  private readonly handleViewportResize = (): void => {
    if (typeof window === 'undefined') return;

    const wasMobile = this.isMobileViewport();
    const isNowMobile = window.innerWidth <= 768;
    this.isMobileViewport.set(isNowMobile);

    if (isNowMobile !== wasMobile) {
      this.isSidebarOpen.set(!isNowMobile);
    }
  };

  pageTitles: { [key: string]: string } = {
    '':                   'Tableau de bord',
    'dashboard':          'Tableau de bord',
    // Assistant IA
    'chat':             'Conversation IA',
    'history':            'Historique des conversations',
    'custom-agents':      'Agents personnalisés',
    'summary':            'Résumé automatique',
    'generation':         'Génération de documents',
    'comparison':         'Comparaison de textes',
    'translation':        'Traduction juridique',
    // Ressources
    'encyclopedia':       'Encyclopédie juridique',
    'case-law':           'Jurisprudence nationale',
    'glossary':           'Glossaire juridique',
    'procedures':         'Guide des démarches',
    'directory':          'Annuaire des juridictions',
    'forms':              'Formulaires téléchargeables',
    // Affaires
    'cases':              'Procès',
    'agenda':             'Agenda & Échéances',
    // Productivité
    'search':             'Recherche globale',
    'notifications':      'Notifications',
    // Cabinet
    'firm':               'Espace cabinet',
    'clients':            'Gestion des clients',
    'billing':            'Facturation & Suivi du temps',
    // Compte
    'profile':            'Mon profil',
    'subscription':       'Abonnement',
    'privacy':            'Confidentialité',
    'settings':           'Paramètres',
  };

  currentPageTitle = computed(() => {
    const route = this.currentRoute();
    return this.pageTitles[route] || 'Tableau de bord';
  });

  /** Section affichée dans la barre du haut : /dashboard/cases/42 → « cases ». */
  private sectionOf(url: string): string {
    const segments = url.split(/[?#]/)[0].split('/').filter(s => s);
    return segments[1] ?? '';
  }

  // Expose features + user info au template
  readonly features        = this.featureService.featureList;
  readonly planName        = this.featureService.planName;
  readonly isFree          = this.featureService.isFree;
  readonly userName        = computed(() => this.authService.user()?.name ?? '');
  readonly profileType     = computed(() => this.authService.user()?.profile_type ?? '');
  readonly userInitial     = computed(() => (this.authService.user()?.name ?? 'U')[0].toUpperCase());
  readonly hasCustomAgents = computed(() => this.featureService.has('agents_custom'));
  readonly hasProces       = computed(() => this.featureService.has('proces_create'));

  // Vérifier si on est sur mobile
  isMobile(): boolean {
    return this.isMobileViewport();
  }

  // Fermer la sidebar sur mobile
  closeSidebarOnMobile() {
    if (this.isMobile()) {
      this.isSidebarOpen.set(false);
    }
  }

  constructor() {
    // Écouter les changements de route
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.currentRoute.set(this.sectionOf(event.urlAfterRedirects));
        this.closeSidebarOnMobile();
      });

    // Initialiser avec la route actuelle
    this.currentRoute.set(this.sectionOf(this.router.url));

    // Initialiser la sidebar : ouverte sur desktop, fermée sur mobile
    if (typeof window !== 'undefined') {
      this.isSidebarOpen.set(!this.isMobileViewport());
      window.addEventListener('resize', this.handleViewportResize);
    }
  }

  toggleSidebar() {
    this.isSidebarOpen.update(value => !value);
    
    // Fermer automatiquement sur mobile après navigation
    if (this.isMobile() && this.isSidebarOpen()) {
      // Optionnel : fermer après un délai ou après clic sur un lien
    }
  }

  ngOnInit(): void {
    if (!this.authService.isLoggedIn()) {
      this.authService.handleSessionExpired(this.router.url);
      return;
    }

    const onReady = (): void => this.redirectFreeUserHome();

    if (this.featureService.isLoaded()) {
      onReady();
    } else {
      this.featureService.load().subscribe({ next: () => onReady() });
    }
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('resize', this.handleViewportResize);
    }
  }

  closeSurvey(): void {
    this.showSurvey.set(false);
    // Utilisateur gratuit : son point d'entrée est la conversation.
    if (this.isFree() && this.router.url.split('?')[0].replace(/\/$/, '') === '/dashboard') {
      this.router.navigate(['/dashboard/chat']);
    }
  }

  private redirectFreeUserHome(): void {
    if (!this.isFree()) return;
    const url = this.router.url.split('?')[0].replace(/\/$/, '');
    if (url === '/dashboard') {
      this.router.navigate(['/dashboard/chat']);
    }
  }

  userProfileLink(): string {
    return this.isFree() ? '/dashboard/subscription' : '/dashboard/profile';
  }

  logout() {
    this.authService.logout();
    this.featureService.clear();
    this.router.navigate(['/']);
  }
}

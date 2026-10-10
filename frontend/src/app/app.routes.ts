import { Routes } from '@angular/router';
import { authGuard } from './guards/auth-guard';
import { adminGuard } from './core/guards/admin.guard';
import { guestGuard } from './guards/guest.guard';
import { freeTierGuard } from './guards/free-tier.guard';

export const routes: Routes = [

  // ── Public pages ────────────────────────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./pages/home/home').then(m => m.Home),
  },
  {
    path: 'pricing',
    loadComponent: () => import('./pages/pricing/pricing').then(m => m.Pricing),
  },
  {
    path: 'support',
    loadComponent: () => import('./pages/support/support').then(m => m.Support),
  },
  {
    path: 'terms',
    loadComponent: () => import('./pages/terms/terms').then(m => m.Terms),
  },
  {
    path: 'guide',
    loadComponent: () => import('./pages/guide/guide').then(m => m.Guide),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.Login),
    canActivate: [guestGuard],
  },
  {
    path: 'signup',
    loadComponent: () => import('./pages/signup/signup').then(m => m.Signup),
    canActivate: [guestGuard],
  },
  // Le questionnaire d'accueil est désormais une fenêtre dans l'espace client
  { path: 'onboarding', redirectTo: 'dashboard', pathMatch: 'full' },

  // Legacy French URL redirects → English routes
  { path: 'tarif',      redirectTo: 'pricing',    pathMatch: 'full' },
  { path: 'connexion',  redirectTo: 'login',      pathMatch: 'full' },
  { path: 'inscription', redirectTo: 'signup',    pathMatch: 'full' },
  { path: 'pcu',        redirectTo: 'terms',      pathMatch: 'full' },

  // ── User dashboard (auth protected) ─────────────────────────────────────────
  {
    path: 'dashboard',
    loadComponent: () => import('./layouts/dashboard-layout/dashboard-layout').then(m => m.DashboardLayout),
    canActivate: [authGuard],
    canActivateChild: [freeTierGuard],
    children: [

      // Home
      {
        path: '',
        loadComponent: () => import('./pages/overview/overview').then(m => m.Overview),
      },

      // Legacy French URL redirects inside dashboard
      { path: 'historique',       redirectTo: 'history',          pathMatch: 'full' },
      { path: 'proces',           redirectTo: 'cases',            pathMatch: 'full' },
      { path: 'proces/:id',       redirectTo: 'cases/:id',        pathMatch: 'full' },
      { path: 'agent-personnalise', redirectTo: 'custom-agents',  pathMatch: 'full' },
      { path: 'confidentialite',  redirectTo: 'privacy',          pathMatch: 'full' },
      { path: 'parametres',       redirectTo: 'settings',         pathMatch: 'full' },
      { path: 'abonnement',       redirectTo: 'subscription',     pathMatch: 'full' },
      { path: 'resumé',           redirectTo: 'summary',          pathMatch: 'full' },
      { path: 'comparaison',      redirectTo: 'comparison',       pathMatch: 'full' },
      { path: 'traduction',       redirectTo: 'translation',      pathMatch: 'full' },
      { path: 'encyclopedie',     redirectTo: 'encyclopedia',     pathMatch: 'full' },
      { path: 'glossaire',        redirectTo: 'glossary',         pathMatch: 'full' },
      { path: 'demarches',        redirectTo: 'procedures',       pathMatch: 'full' },
      { path: 'annuaire',         redirectTo: 'directory',        pathMatch: 'full' },
      { path: 'formulaires',      redirectTo: 'forms',            pathMatch: 'full' },
      { path: 'jurisprudence',    redirectTo: 'case-law',         pathMatch: 'full' },
      { path: 'recherche',        redirectTo: 'search',           pathMatch: 'full' },
      { path: 'cabinet',          redirectTo: 'firm',             pathMatch: 'full' },
      { path: 'facturation',      redirectTo: 'billing',          pathMatch: 'full' },

      // ── AI Assistant ──────────────────────────────────────────────────────────
      { path: 'conversation',     redirectTo: 'chat',    pathMatch: 'full' },
      { path: 'conversation/:id', redirectTo: 'chat/:id', pathMatch: 'full' },
      {
        path: 'chat',
        loadComponent: () => import('./pages/conversation/conversation').then(m => m.Conversation),
      },
      {
        path: 'chat/:id',
        loadComponent: () => import('./pages/conversation/conversation').then(m => m.Conversation),
      },
      {
        path: 'history',
        loadComponent: () => import('./pages/history/history').then(m => m.History),
      },
      {
        path: 'custom-agents',
        loadComponent: () => import('./pages/custom-agents/custom-agents').then(m => m.CustomAgents),
      },
      {
        path: 'summary',
        loadComponent: () => import('./pages/document-summary/document-summary').then(m => m.DocumentSummary),
      },
      {
        path: 'generation',
        loadComponent: () => import('./pages/generation/generation').then(m => m.Generation),
      },
      {
        path: 'comparison',
        loadComponent: () => import('./pages/comparison/comparison').then(m => m.Comparison),
      },
      {
        path: 'translation',
        loadComponent: () => import('./pages/translation/translation').then(m => m.Translation),
      },

      // ── Case management ───────────────────────────────────────────────────────
      {
        path: 'cases',
        loadComponent: () => import('./pages/cases/cases').then(m => m.Cases),
      },
      {
        path: 'cases/:id',
        loadComponent: () => import('./pages/cases/detail/case-detail').then(m => m.CaseDetailPage),
      },
      {
        path: 'agenda',
        loadComponent: () => import('./pages/agenda/agenda').then(m => m.Agenda),
      },

      // ── Legal resources ───────────────────────────────────────────────────────
      {
        path: 'encyclopedia',
        loadComponent: () => import('./pages/encyclopedia/encyclopedia').then(m => m.Encyclopedia),
      },
      {
        path: 'glossary',
        loadComponent: () => import('./pages/glossary/glossary').then(m => m.Glossary),
      },
      {
        path: 'procedures',
        loadComponent: () => import('./pages/procedures/procedures').then(m => m.Procedures),
      },
      {
        path: 'directory',
        loadComponent: () => import('./pages/coming-soon/coming-soon').then(m => m.ComingSoon),
        data: { feature: 'directory' },
      },
      {
        path: 'forms',
        loadComponent: () => import('./pages/forms/forms').then(m => m.Forms),
      },
      {
        path: 'case-law',
        loadComponent: () => import('./pages/case-law/case-law').then(m => m.CaseLaw),
      },

      // ── Productivity ──────────────────────────────────────────────────────────
      {
        path: 'search',
        loadComponent: () => import('./pages/coming-soon/coming-soon').then(m => m.ComingSoon),
        data: { feature: 'search' },
      },
      {
        path: 'notifications',
        loadComponent: () => import('./pages/coming-soon/coming-soon').then(m => m.ComingSoon),
        data: { feature: 'notifications' },
      },

      // ── Account ───────────────────────────────────────────────────────────────
      {
        path: 'profile',
        loadComponent: () => import('./pages/profile/profile').then(m => m.Profile),
      },
      {
        path: 'settings',
        loadComponent: () => import('./pages/settings/settings').then(m => m.Settings),
      },
      {
        path: 'subscription',
        loadComponent: () => import('./pages/subscription/subscription').then(m => m.Subscription),
      },
      {
        path: 'subscription/payment/success',
        loadComponent: () => import('./pages/payment-return/payment-return').then(m => m.PaymentReturn),
        data: { paymentOutcome: 'success' },
      },
      {
        path: 'subscription/payment/cancel',
        loadComponent: () => import('./pages/payment-return/payment-return').then(m => m.PaymentReturn),
        data: { paymentOutcome: 'cancel' },
      },
      {
        path: 'privacy',
        loadComponent: () => import('./pages/privacy/privacy').then(m => m.Privacy),
      },

      // ── Law firm (enterprise) ─────────────────────────────────────────────────
      {
        path: 'firm',
        loadComponent: () => import('./pages/coming-soon/coming-soon').then(m => m.ComingSoon),
        data: { feature: 'firm' },
      },
      {
        path: 'clients',
        loadComponent: () => import('./pages/coming-soon/coming-soon').then(m => m.ComingSoon),
        data: { feature: 'clients' },
      },
      {
        path: 'billing',
        loadComponent: () => import('./pages/coming-soon/coming-soon').then(m => m.ComingSoon),
        data: { feature: 'billing' },
      },
    ],
  },

  // ── Admin interface (admin role required) ────────────────────────────────────
  {
    path: 'admin',
    loadComponent: () => import('./layouts/admin-layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        loadComponent: () => import('./pages/admin/admin-dashboard/admin-dashboard').then(m => m.AdminDashboard),
      },
      {
        path: 'users',
        loadComponent: () => import('./pages/admin/admin-users/admin-users').then(m => m.AdminUsers),
      },
      {
        path: 'questions',
        loadComponent: () => import('./pages/admin/admin-questions/admin-questions').then(m => m.AdminQuestions),
      },
      {
        path: 'audit',
        loadComponent: () => import('./pages/admin/admin-audit/admin-audit').then(m => m.AdminAudit),
      },
      {
        path: 'contacts',
        loadComponent: () => import('./pages/admin/admin-contacts/admin-contacts').then(m => m.AdminContacts),
      },
      {
        path: 'testimonials',
        loadComponent: () => import('./pages/admin/admin-testimonials/admin-testimonials').then(m => m.AdminTestimonials),
      },
      {
        path: 'pricing',
        loadComponent: () => import('./pages/admin/admin-pricing/admin-pricing').then(m => m.AdminPricing),
      },
      {
        path: 'faq',
        loadComponent: () => import('./pages/admin/admin-faq/admin-faq').then(m => m.AdminFaq),
      },
      {
        path: 'config',
        loadComponent: () => import('./pages/admin/admin-config/admin-config').then(m => m.AdminConfig),
      },
      {
        path: 'agents',
        loadComponent: () => import('./pages/admin/admin-agents/admin-agents').then(m => m.AdminAgents),
      },
      {
        path: 'procedures',
        loadComponent: () => import('./pages/admin/admin-procedures/admin-procedures').then(m => m.AdminProcedures),
      },
      {
        path: 'conversations',
        loadComponent: () => import('./pages/admin/admin-conversations/admin-conversations').then(m => m.AdminConversations),
      },
      {
        path: 'moderation',
        loadComponent: () => import('./pages/admin/admin-moderation/admin-moderation').then(m => m.AdminModeration),
      },
      {
        path: 'system',
        loadComponent: () => import('./pages/admin/admin-system/admin-system').then(m => m.AdminSystem),
      },
      {
        path: 'subscriptions',
        loadComponent: () => import('./pages/admin/admin-subscriptions/admin-subscriptions').then(m => m.AdminSubscriptions),
      },
    ],
  },

  // ── Fallback ─────────────────────────────────────────────────────────────────
  {
    path: '**',
    redirectTo: '',
  },
];

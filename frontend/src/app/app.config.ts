import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withInMemoryScrolling, withViewTransitions, TitleStrategy } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { prerenderInterceptor } from './core/interceptors/prerender.interceptor';
import { PageTitleStrategy } from './core/page-title.strategy';
import { SeoService } from './core/seo/seo.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(
      routes,
      // Nouvelle page = haut de page (retour arrière = position précédente)
      withInMemoryScrolling({ scrollPositionRestoration: 'enabled', anchorScrolling: 'enabled' }),
      // Fondu entre les pages (View Transitions API ; ignoré par les navigateurs sans support)
      withViewTransitions({ skipInitialTransition: true }),
    ),
    provideHttpClient(withInterceptors([prerenderInterceptor, authInterceptor])),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    // Balises de référencement de chaque page (titre, description, canonique, données structurées)
    provideAppInitializer(() => inject(SeoService).init()),
  ]
};

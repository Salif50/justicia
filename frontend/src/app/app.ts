import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterOutlet, Router, NavigationStart, NavigationEnd, NavigationCancel, NavigationError } from '@angular/router';
import { LoaderComponent } from './components/loader/loader.component';
import { ServiceBanner } from './components/service-banner/service-banner';
import { ThemeService } from './services/theme.service';

/** Erreurs de chargement d'un morceau de code (page ouverte avant un nouveau déploiement). */
const STALE_CHUNK = /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|MIME type/i;
const RELOAD_KEY = 'justicia:stale-reload';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, LoaderComponent, ServiceBanner],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly title = signal('justicIA');
  protected readonly loading = signal(false);

  private readonly router = inject(Router);
  private readonly _theme = inject(ThemeService);

  ngOnInit(): void {
    this.router.events.subscribe(event => {
      if (event instanceof NavigationStart) {
        this.loading.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.loading.set(false);
        if (event instanceof NavigationError) this.recoverFromStaleBuild(event);
      }
    });
  }

  /**
   * Un onglet ouvert avant une mise en ligne réclame d'anciens fichiers qui
   * n'existent plus : la navigation échoue sans rien afficher. On recharge alors
   * une fois la page demandée, ce qui charge la nouvelle version du site.
   */
  private recoverFromStaleBuild(event: NavigationError): void {
    if (!STALE_CHUNK.test(String(event.error?.message ?? event.error ?? ''))) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 10_000) return;   // pas de boucle si le problème persiste
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch { /* stockage indisponible : on recharge quand même une fois */ }
    window.location.assign(event.url);
  }
}

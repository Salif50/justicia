import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * Titre d'onglet « Page · JusticIA ». Les routes sans `title`
 * (espace client, admin) gardent le titre générique.
 */
@Injectable({ providedIn: 'root' })
export class PageTitleStrategy extends TitleStrategy {
  private static readonly BRAND = 'JusticIA';
  private static readonly DEFAULT = 'JusticIA — Assistant juridique · République de Guinée';

  constructor(private readonly title: Title) { super(); }

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.title.setTitle(page ? `${page} · ${PageTitleStrategy.BRAND}` : PageTitleStrategy.DEFAULT);
  }
}

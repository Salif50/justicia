import { inject } from '@angular/core';
import { RedirectCommand, ResolveFn, Router } from '@angular/router';
import { TEXT_LOADERS } from './data/texte-loaders';
import { JO_LOADERS } from './data/jo-loaders';

/**
 * Données des pages générées, chargées avant l'affichage (le pré-rendu les attend).
 * Chaque texte ou année est un fichier séparé, téléchargé seulement à la demande.
 * Adresse inconnue : retour à la liste correspondante.
 */
export const texteResolver: ResolveFn<unknown> = route => {
  const router = inject(Router);
  const load = TEXT_LOADERS[route.paramMap.get('slug') ?? ''];
  return load ? load() : new RedirectCommand(router.parseUrl('/textes-de-loi-guinee'));
};

export const joYearResolver: ResolveFn<unknown> = route => {
  const router = inject(Router);
  const load = JO_LOADERS[route.paramMap.get('annee') ?? ''];
  return load ? load() : new RedirectCommand(router.parseUrl('/journal-officiel-guinee'));
};

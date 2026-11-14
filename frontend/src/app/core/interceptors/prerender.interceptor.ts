import { HttpInterceptorFn } from '@angular/common/http';
import { PLATFORM_ID, inject } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { EMPTY } from 'rxjs';

/**
 * Pré-rendu : aucun appel réseau. Les pages publiques s'affichent avec leurs
 * données exportées (pages/seo/data) ; le navigateur charge ensuite les données à jour.
 * La construction du site ne dépend ainsi jamais de la disponibilité de l'API.
 */
export const prerenderInterceptor: HttpInterceptorFn = (req, next) =>
  isPlatformServer(inject(PLATFORM_ID)) ? EMPTY : next(req);

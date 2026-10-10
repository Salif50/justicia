/** Options du questionnaire d'accueil — partagées avec la fiche utilisateur admin. */
export interface Choice { key: string; label: string; hint?: string; }

export const DOMAINS: Choice[] = [
  { key: 'travail',      label: 'Droit du travail' },
  { key: 'penal',        label: 'Droit pénal et procédure' },
  { key: 'famille',      label: 'Famille et personnes' },
  { key: 'foncier',      label: 'Foncier et domanial' },
  { key: 'affaires',     label: 'Affaires et sociétés' },
  { key: 'fiscal',       label: 'Fiscalité et marchés publics' },
  { key: 'institutions', label: 'Constitution et institutions' },
  { key: 'ressources',   label: 'Mines, pétrole et environnement' },
];

export const USAGES: Choice[] = [
  { key: 'comprendre', label: 'Comprendre mes droits',           hint: 'Obtenir des réponses claires à des situations personnelles' },
  { key: 'consulter',  label: 'Préparer consultations et plaidoiries', hint: 'Retrouver rapidement les articles applicables' },
  { key: 'dossiers',   label: 'Gérer des dossiers et des échéances', hint: 'Suivre procès, pièces et délais' },
  { key: 'rediger',    label: 'Rédiger des documents',            hint: 'Contrats, requêtes, courriers juridiques' },
  { key: 'conformite', label: 'Conformité d\'entreprise',         hint: 'Sécuriser les décisions RH, commerciales et fiscales' },
  { key: 'recherche',  label: 'Enseignement et recherche',        hint: 'Étudier, enseigner, analyser les textes' },
];

export const SOURCES: Choice[] = [
  { key: 'bouche',      label: 'Recommandation d\'un proche ou confrère' },
  { key: 'reseaux',     label: 'Réseaux sociaux' },
  { key: 'recherche',   label: 'Moteur de recherche' },
  { key: 'institution', label: 'Barreau, institution ou employeur' },
  { key: 'universite',  label: 'Université ou école' },
  { key: 'autre',       label: 'Autre' },
];

/** Libellé lisible d'une clé, ou la clé elle-même si inconnue. */
export function choiceLabel(list: Choice[], key: string | null | undefined): string {
  if (!key) return '';
  return list.find(c => c.key === key)?.label ?? key;
}

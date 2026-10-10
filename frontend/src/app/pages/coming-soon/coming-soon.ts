import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

// Métadonnées par route pour personnaliser la page
const FEATURE_META: Record<string, {
  icon: string; title: string; description: string;
  plan: string; eta: string; hints: string[];
}> = {
  'summary':       { icon: 'file', title: 'Résumé automatique',      plan: 'Basic',      eta: 'Q2 2026',
    description: 'Uploadez un PDF et obtenez en 1 clic un résumé structuré : faits clés, parties, dates, enjeux.',
    hints: ['Supporte les PV, jugements, contrats', 'Résumé en 3 niveaux de détail', 'Export du résumé en PDF'] },
  'generation':    { icon: 'pen', title: 'Génération de documents', plan: 'Pro',         eta: 'Q2 2026',
    description: 'Générez des brouillons de requêtes, conclusions, mémoires et contrats simples à partir d\'un prompt.',
    hints: ['Modèles adaptés au droit guinéen', 'Édition en ligne avant export', 'Formats DOCX et PDF'] },
  'comparison':   { icon: 'search', title: 'Comparaison de textes',   plan: 'Pro',         eta: 'Q2 2026',
    description: 'Comparez deux versions d\'un contrat ou d\'une loi et visualisez les différences mot par mot.',
    hints: ['Diff couleur (ajouts/suppressions)', 'Commentaires sur les écarts', 'Comparaison de jurisprudences'] },
  'translation':    { icon: 'globe', title: 'Traduction juridique',     plan: 'Basic',       eta: 'Q3 2026',
    description: 'Traduction Français ↔ Anglais spécialisée pour les documents internationaux.',
    hints: ['Terminologie juridique précise', 'Préserve la structure du document', 'Pular & Malinké à venir'] },
  'encyclopedia':  { icon: 'book', title: 'Encyclopédie juridique',   plan: 'Gratuit',     eta: 'Q2 2026',
    description: 'Moteur de recherche en langage naturel dans tous les textes de loi guinéens.',
    hints: ['Code pénal, civil, commercial', 'Recherche par article ou thème', 'Mis à jour en temps réel'] },
  'glossary':     { icon: 'book-open', title: 'Glossaire juridique',      plan: 'Gratuit',     eta: 'Q2 2026',
    description: 'Définitions simplifiées des termes juridiques en français courant et en langues locales guinéennes.',
    hints: ['Plus de 500 termes définis', 'Exemples pratiques', 'Disponible en Pular et Malinké'] },
  'procedures':     { icon: 'folder-tree', title: 'Guide des démarches',     plan: 'Gratuit',     eta: 'Q2 2026',
    description: 'Guide pratique des démarches administratives et judiciaires : porter plainte, casier judiciaire, etc.',
    hints: ['Étape par étape illustré', 'Documents requis pour chaque démarche', 'Adresses et horaires'] },
  'directory':      { icon: 'landmark', title: 'Annuaire des juridictions', plan: 'Gratuit',   eta: 'Q2 2026',
    description: 'Répertoire complet des tribunaux, cours d\'appel et cours suprême avec contacts et compétences.',
    hints: ['Carte interactive', 'Horaires et jours d\'audience', 'Compétences territoriales'] },
  'forms':   { icon: 'clipboard', title: 'Formulaires téléchargeables', plan: 'Gratuit', eta: 'Q3 2026',
    description: 'Bibliothèque de modèles de lettres, requêtes simples et formulaires officiels prêts à l\'emploi.',
    hints: ['Formulaires éditables en ligne', 'Modèles validés par des juristes', 'Téléchargement PDF/DOCX'] },
  'case-law': { icon: 'scale', title: 'Jurisprudence nationale',  plan: 'Basic',       eta: 'Q4 2026',
    description: 'Base de données des décisions de justice guinéennes, consultable et citée automatiquement par l\'IA.',
    hints: ['Recherche par infraction ou thème', 'Lien vers la décision complète', 'Citée dans les réponses IA'] },
  'agenda':        { icon: 'calendar', title: 'Agenda & Échéances',        plan: 'Basic',       eta: 'Q2 2026',
    description: 'Calendrier des audiences, alertes pour les délais de recours et rappels automatiques par email/SMS.',
    hints: ['Synchronisable avec Google Calendar', 'Alertes 7, 3, 1 jour avant', 'Délais de prescription calculés'] },
  'search':     { icon: 'search', title: 'Recherche globale',         plan: 'Basic',       eta: 'Q2 2026',
    description: 'Recherche plein texte dans tous vos dossiers, déclarations, conversations et documents à la fois.',
    hints: ['Filtres par date, type, auteur', 'Recherche sémantique (IA)', 'Résultats en temps réel'] },
  'firm':       { icon: 'building', title: 'Espace cabinet',             plan: 'Entreprise',  eta: 'Q3 2026',
    description: 'Compte maître + collaborateurs (associés, stagiaires, secrétaires) avec rôles et permissions dédiés.',
    hints: ['Invitations par email', 'Tableau de bord de l\'activité du cabinet', 'Affectation de dossiers'] },
  'clients':       { icon: 'users', title: 'Gestion des clients',        plan: 'Entreprise',  eta: 'Q3 2026',
    description: 'CRM juridique : fiches clients, historique des affaires, coordonnées et notes internes.',
    hints: ['Import depuis Excel/CSV', 'Lien client ↔ dossier automatique', 'Suivi des relances'] },
  'billing':   { icon: 'wallet', title: 'Suivi du temps & Facturation', plan: 'Entreprise', eta: 'Q3 2026',
    description: 'Horodatez votre travail par dossier et générez des factures d\'honoraires en un clic.',
    hints: ['Taux horaire par collaborateur', 'Factures PDF aux normes', 'Export comptable'] },
  'notifications': { icon: 'bell', title: 'Notifications intelligentes', plan: 'Basic',      eta: 'Q2 2026',
    description: 'Email, SMS et notifications push pour les alertes critiques, audiences et partages.',
    hints: ['Digest hebdomadaire personnalisé', 'Notifications push (web + mobile)', 'Paramétrage fin'] },
};

const DEFAULT_META = {
  icon: 'rocket', title: 'Fonctionnalité en développement', plan: 'Basic', eta: 'Bientôt',
  description: 'Cette fonctionnalité est en cours de développement et sera disponible prochainement.',
  hints: ['Inscrivez-vous à la newsletter pour être informé', 'Disponible dans une prochaine mise à jour'],
};

@Component({
  selector:    'app-coming-soon',
  imports:     [CommonModule, RouterLink],
  templateUrl: './coming-soon.html',
  styleUrl:    './coming-soon.scss',
})
export class ComingSoon implements OnInit {
  meta = signal(DEFAULT_META);

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    const key = this.route.snapshot.data['feature'] as string ?? '';
    this.meta.set(FEATURE_META[key] ?? DEFAULT_META);
  }
}

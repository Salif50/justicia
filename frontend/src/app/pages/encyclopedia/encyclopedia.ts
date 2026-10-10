import {
  Component, signal, computed, inject, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  EncyclopediaService,
  SearchResponse,
  AskCodeResponse,
  ArticleResult,
} from '../../services/encyclopedia.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

// ── Types ─────────────────────────────────────────────────────────────────────
type EncTab     = 'library' | 'search';
type SearchStage = 'idle' | 'loading' | 'done' | 'error';

interface CodeJuridique {
  id:          string;
  titre:       string;
  annee:       number;
  categorie:   string;
  articles:    number;
  description: string;
  domaines:    string[];
  importance:  'Fondamental' | 'Majeur' | 'Spécialisé';
}

// ── Données statiques des codes ───────────────────────────────────────────────
const CODES_RAW: CodeJuridique[] = [
  { id: 'doc_011', titre: 'Constitution de la République de Guinée', annee: 2025, categorie: 'Constitutionnel', articles: 201, importance: 'Fondamental', description: 'Loi fondamentale de la République. Consacre les droits fondamentaux des citoyens, organise les pouvoirs de l\'État et définit les principes de la République de Guinée.', domaines: ['Droits fondamentaux', 'Organisation de l\'État', 'Libertés publiques', 'Institutions'] },
  { id: 'doc_014', titre: 'Charte de la Transition', annee: 2021, categorie: 'Constitutionnel', articles: 83, importance: 'Fondamental', description: 'Texte constitutionnel régissant la période de transition. Consacre les valeurs de la transition, ses organes et les principes de réconciliation nationale.', domaines: ['Transition politique', 'Institutions de transition', 'Réconciliation'] },
  { id: 'doc_032', titre: 'Code civil', annee: 2019, categorie: 'Civil', articles: 1637, importance: 'Fondamental', description: 'Corpus principal du droit civil. Régit les personnes, la famille, les successions, les contrats et les obligations. Socle de tout le droit privé guinéen.', domaines: ['Personnes et famille', 'Successions', 'Contrats', 'Obligations', 'Biens'] },
  { id: 'doc_008', titre: 'Code pénal', annee: 2016, categorie: 'Pénal', articles: 1011, importance: 'Fondamental', description: 'Définit les infractions pénales et les peines applicables en Guinée. Couvre les crimes contre les personnes, les biens, l\'État, et les infractions économiques.', domaines: ['Crimes', 'Délits', 'Contraventions', 'Peines', 'Infractions spéciales'] },
  { id: 'doc_020', titre: 'Code de procédure pénale', annee: 2016, categorie: 'Procédure', articles: 1260, importance: 'Fondamental', description: 'Organise la procédure judiciaire en matière pénale : enquête, instruction, jugement, voies de recours. Garantit les droits de la défense et les libertés individuelles.', domaines: ['Enquête judiciaire', 'Instruction', 'Jugement', 'Appel', 'Droits de la défense'] },
  { id: 'doc_001', titre: 'Code des activités économiques', annee: 1994, categorie: 'Commerce', articles: 2010, importance: 'Majeur', description: 'Régit l\'ensemble des activités économiques et commerciales en Guinée. Traite de la liberté d\'entreprendre, des sociétés commerciales, du registre du commerce et de la concurrence.', domaines: ['Sociétés', 'Registre du commerce', 'Concurrence', 'Liberté d\'entreprendre', 'Faillites'] },
  { id: 'doc_009', titre: 'Code du travail', annee: 2014, categorie: 'Travail', articles: 464, importance: 'Majeur', description: 'Réglemente les relations individuelles et collectives de travail entre employeurs et salariés. Traite du contrat de travail, des salaires, du licenciement, des syndicats.', domaines: ['Contrat de travail', 'Salaires', 'Licenciement', 'Syndicats', 'Conditions de travail'] },
  { id: 'doc_023', titre: 'Code du travail (révisé)', annee: 2016, categorie: 'Travail', articles: 509, importance: 'Majeur', description: 'Version actualisée du code du travail intégrant les réformes récentes. Régit les relations individuelles et collectives de travail, la protection des travailleurs.', domaines: ['Contrat de travail', 'Droits des travailleurs', 'Syndicats', 'Sécurité au travail'] },
  { id: 'doc_005', titre: "Code de l'enfant", annee: 2008, categorie: 'Famille', articles: 1004, importance: 'Majeur', description: 'Protège les droits des enfants et réglemente les situations les concernant : état civil, adoption, filiation, protection contre les abus, délinquance juvénile.', domaines: ["Droits de l'enfant", 'Protection', 'État civil', 'Adoption', 'Justice des mineurs'] },
  { id: 'doc_006', titre: 'Code foncier et domanial', annee: 1992, categorie: 'Foncier', articles: 241, importance: 'Majeur', description: 'Organise le régime de la propriété foncière en Guinée : acquisition, immatriculation, titres fonciers, droits coutumiers, expropriation et domaine de l\'État.', domaines: ['Propriété foncière', 'Immatriculation', 'Domaine public', 'Expropriation', 'Droits coutumiers'] },
  { id: 'doc_007', titre: 'Code minier', annee: 2013, categorie: 'Mines', articles: 252, importance: 'Majeur', description: 'Réglemente l\'exploration et l\'exploitation des ressources minières de Guinée (bauxite, fer, or, diamants). Fixe les conditions d\'octroi des titres miniers et la fiscalité minière.', domaines: ['Titres miniers', 'Exploitation', 'Exploration', 'Fiscalité minière', 'Environnement minier'] },
  { id: 'doc_033', titre: 'Code général des impôts', annee: 2020, categorie: 'Fiscal', articles: 820, importance: 'Majeur', description: 'Fixe l\'ensemble de la fiscalité guinéenne : impôts sur le revenu, TVA, droits d\'enregistrement, impôts locaux et taxes diverses.', domaines: ['Impôt sur le revenu', 'TVA', 'Enregistrement', 'Taxes locales', 'Fiscalité des entreprises'] },
  { id: 'doc_031', titre: 'Code de procédure civile', annee: 2018, categorie: 'Procédure', articles: 915, importance: 'Majeur', description: 'Organise la procédure devant les juridictions civiles guinéennes : saisine, instruction, jugement, exécution des décisions, voies de recours.', domaines: ['Procédure civile', 'Saisine des tribunaux', 'Exécution des jugements', 'Appel', 'Cassation'] },
  { id: 'doc_012', titre: 'Code électoral', annee: 2017, categorie: 'Électoral', articles: 211, importance: 'Majeur', description: 'Régit l\'organisation des élections en Guinée : conditions d\'éligibilité, inscription sur les listes, déroulement du scrutin, contentieux électoral.', domaines: ['Élections', 'Éligibilité', 'Campagne électorale', 'Contentieux électoral', 'Listes électorales'] },
  { id: 'doc_016', titre: 'Code pétrolier', annee: 2015, categorie: 'Mines', articles: 95, importance: 'Majeur', description: 'Réglemente l\'exploration et l\'exploitation des ressources pétrolières et gazières de Guinée : conditions d\'octroi des licences, partage de production.', domaines: ['Exploration pétrolière', 'Licences', 'Partage de production', 'Fiscalité pétrolière'] },
  { id: 'doc_025', titre: 'Organisation judiciaire', annee: 2015, categorie: 'Justice', articles: 85, importance: 'Majeur', description: 'Fixe l\'organisation des juridictions guinéennes : tribunaux de première instance, cours d\'appel, Cour suprême, compétences et procédures.', domaines: ['Tribunaux', "Cours d'appel", 'Cour suprême', 'Compétence judiciaire'] },
  { id: 'doc_030', titre: 'Loi sur les établissements de crédit', annee: 2019, categorie: 'Finance', articles: 103, importance: 'Majeur', description: 'Régit l\'exercice des activités bancaires et financières en Guinée : conditions d\'agrément, contrôle prudentiel, protection des déposants.', domaines: ['Banques', 'Crédit', 'Contrôle bancaire', 'Protection des déposants'] },
  { id: 'doc_015', titre: 'Code de sécurité sociale', annee: 1994, categorie: 'Travail', articles: 131, importance: 'Majeur', description: 'Organise la protection sociale des travailleurs : assurance maladie, retraite, accidents du travail, maternité. Réglemente l\'INSS.', domaines: ['Retraite', 'Maladie', 'Accidents du travail', 'Maternité', 'INSS'] },
  { id: 'doc_003', titre: "Code de protection de l'environnement", annee: 1989, categorie: 'Environnement', articles: 113, importance: 'Spécialisé', description: 'Établit les principes de protection et de mise en valeur de l\'environnement guinéen. Traite de la lutte contre la pollution, la gestion des ressources naturelles.', domaines: ['Pollution', 'Ressources naturelles', "Études d'impact", 'Sanctions environnementales'] },
  { id: 'doc_004', titre: 'Protection de la faune sauvage', annee: 1997, categorie: 'Environnement', articles: 182, importance: 'Spécialisé', description: 'Réglemente la protection de la faune sauvage et la pratique de la chasse en Guinée : espèces protégées, permis de chasse, parcs nationaux et réserves.', domaines: ['Faune sauvage', 'Chasse', 'Parcs nationaux', 'Espèces protégées'] },
  { id: 'doc_002', titre: "Code de conduite de l'agent public", annee: 2019, categorie: 'Administration', articles: 43, importance: 'Spécialisé', description: 'Fixe les règles éthiques et déontologiques applicables aux agents publics guinéens : obligations, interdictions, prévention de la corruption.', domaines: ['Éthique publique', 'Corruption', 'Déontologie', 'Discipline'] },
  { id: 'doc_022', titre: 'Code des marchés publics', annee: 2017, categorie: 'Administration', articles: 189, importance: 'Spécialisé', description: 'Réglemente la passation, l\'exécution et le contrôle des marchés publics en Guinée. Vise la transparence et l\'efficacité dans l\'utilisation des fonds publics.', domaines: ["Appels d'offres", 'Passation de marchés', 'Contrôle', 'Transparence'] },
  { id: 'doc_021', titre: "Loi sur l'accès à l'information", annee: 2020, categorie: 'Droits', articles: 52, importance: 'Spécialisé', description: 'Garantit le droit des citoyens à accéder aux informations détenues par les organismes publics. Fixe les procédures de demande et les exceptions.', domaines: ['Transparence', "Droit d'accès", 'Organismes publics', 'Exceptions'] },
  { id: 'doc_028', titre: 'Loi sur l\'identification biométrique', annee: 2022, categorie: 'Numérique', articles: 129, importance: 'Spécialisé', description: 'Définit les procédés d\'identification numérique et biométrique. Encadre la collecte et l\'utilisation des données biométriques en Guinée.', domaines: ['Biométrie', 'Identité numérique', 'Données personnelles', 'État civil numérique'] },
  { id: 'doc_029', titre: 'Loi sur la cybersécurité', annee: 2022, categorie: 'Numérique', articles: 163, importance: 'Spécialisé', description: 'Définit et réprime les infractions informatiques en Guinée : accès frauduleux aux systèmes, atteinte aux données, fraudes électroniques, cybercriminalité.', domaines: ['Cybercriminalité', 'Infractions informatiques', 'Protection des données', 'Fraude électronique'] },
  { id: 'doc_024', titre: "Loi sur le maintien de l'ordre public", annee: 2020, categorie: 'Sécurité', articles: 42, importance: 'Spécialisé', description: 'Définit les règles applicables aux opérations de maintien de l\'ordre public en Guinée : conditions d\'usage de la force, droits des manifestants.', domaines: ["Forces de l'ordre", 'Manifestations', 'Usage de la force', 'Liberté de réunion'] },
  { id: 'doc_019', titre: 'Code de conduite des forces de défense', annee: 2019, categorie: 'Défense', articles: 37, importance: 'Spécialisé', description: 'Fixe les règles éthiques et déontologiques applicables aux membres des forces de défense et de sécurité guinéennes.', domaines: ['Armée', 'Déontologie militaire', "Droits de l'Homme", 'Discipline militaire'] },
  { id: 'doc_026', titre: 'Loi sur la communication', annee: 2018, categorie: 'Droits', articles: 35, importance: 'Spécialisé', description: 'Réglemente les secteurs de la presse, de l\'audiovisuel et des communications électroniques en Guinée. Garantit la liberté de la presse.', domaines: ['Presse', 'Audiovisuel', "Liberté d'expression", 'Communications'] },
  { id: 'doc_013', titre: 'Gouvernance financière des sociétés publiques', annee: 2018, categorie: 'Administration', articles: 80, importance: 'Spécialisé', description: 'Régit la gouvernance financière des sociétés et établissements publics : contrôle, audit, obligations comptables, reddition de comptes.', domaines: ["Sociétés d'État", 'Audit', 'Comptabilité publique', 'Gouvernance'] },
];

const CODES = Array.from(new Map(CODES_RAW.map(c => [c.id, c])).values());

const CATEGORIES = ['Tous', ...Array.from(new Set(CODES.map(c => c.categorie))).sort()];

const CAT_CONFIG: Record<string, { color: string; icon: string }> = {
  'Constitutionnel': { color: '#7c3aed', icon: 'scale' },
  'Civil':           { color: '#FF8A00', icon: 'users' },
  'Pénal':           { color: '#dc2626', icon: 'lock' },
  'Procédure':       { color: '#64748b', icon: 'clipboard' },
  'Commerce':        { color: '#FF5A00', icon: 'briefcase' },
  'Travail':         { color: '#059669', icon: 'factory' },
  'Foncier':         { color: '#d97706', icon: 'home' },
  'Mines':           { color: '#92400e', icon: 'pickaxe' },
  'Fiscal':          { color: '#065f46', icon: 'coins' },
  'Finance':         { color: '#1d4ed8', icon: 'landmark' },
  'Famille':         { color: '#be185d', icon: 'users' },
  'Environnement':   { color: '#15803d', icon: 'leaf' },
  'Administration':  { color: '#4f46e5', icon: 'landmark' },
  'Justice':         { color: '#7c3aed', icon: 'scale' },
  'Électoral':       { color: '#b45309', icon: 'vote' },
  'Droits':          { color: '#0284c7', icon: 'fist' },
  'Numérique':       { color: '#0e7490', icon: 'laptop' },
  'Sécurité':        { color: '#991b1b', icon: 'shield' },
  'Défense':         { color: '#374151', icon: 'flag' },
};

const THINKING_SEARCH = [
  'Analyse de votre requête…',
  'Recherche sémantique dans le corpus…',
  'Récupération des articles pertinents…',
  'Classement par pertinence…',
  'Génération du résumé…',
  'Finalisation des résultats…',
];

const THINKING_ASK = [
  'Lecture de votre question…',
  'Consultation des textes de loi…',
  'Extraction des articles pertinents…',
  'Analyse juridique…',
  'Rédaction de la réponse…',
  'Finalisation…',
];

@Component({
  selector:    'app-encyclopedie',
  imports:     [CommonModule, FormsModule, RouterLink, UiIcon],
  templateUrl: './encyclopedia.html',
  styleUrl:    './encyclopedia.scss',
})
export class Encyclopedia implements OnDestroy {
  private svc = inject(EncyclopediaService);

  readonly CODES      = CODES;
  readonly CATEGORIES = CATEGORIES;
  readonly CAT_CONFIG = CAT_CONFIG;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab = signal<EncTab>('library');

  // ── Bibliothèque ──────────────────────────────────────────────────────────
  selectedCategory = signal('Tous');
  localSearch      = signal('');
  expandedId       = signal<string | null>(null);

  // ── Q&A inline sur une carte ──────────────────────────────────────────────
  askingCardId = signal<string | null>(null);
  askQuestion  = signal<string>('');
  askResult    = signal<AskCodeResponse | null>(null);
  askStage     = signal<SearchStage>('idle');
  askError     = signal<string>('');

  // ── Recherche IA ──────────────────────────────────────────────────────────
  searchQuery  = signal<string>('');
  searchStage  = signal<SearchStage>('idle');
  searchResult = signal<SearchResponse | null>(null);
  searchError  = signal<string>('');

  // ── Thinking animation ────────────────────────────────────────────────────
  thinkingMessages: string[] = [];
  thinkingStep = signal<number>(0);
  private _timer?: ReturnType<typeof setInterval>;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredCodes = computed(() => {
    const cat = this.selectedCategory();
    const q   = this.localSearch().toLowerCase().trim();
    return CODES.filter(c => {
      if (cat !== 'Tous' && c.categorie !== cat) return false;
      if (q && !c.titre.toLowerCase().includes(q) && !c.description.toLowerCase().includes(q) && !c.domaines.some(d => d.toLowerCase().includes(q))) return false;
      return true;
    });
  });

  readonly totalArticles  = computed(() => CODES.reduce((s, c) => s + c.articles, 0));
  readonly fondamentaux   = computed(() => CODES.filter(c => c.importance === 'Fondamental').length);
  readonly categoriesCount = computed(() => new Set(CODES.map(c => c.categorie)).size);

  readonly searchValid = computed(() => this.searchQuery().trim().length >= 3);
  readonly askValid    = computed(() => this.askQuestion().trim().length >= 5);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnDestroy() { this._stopThinking(); }

  // ── Tab ───────────────────────────────────────────────────────────────────
  switchTab(tab: EncTab) { this.activeTab.set(tab); }

  // ── Bibliothèque ──────────────────────────────────────────────────────────
  toggleCard(id: string) {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      this.closeAsk();
    } else {
      this.expandedId.set(id);
      this.closeAsk();
    }
  }

  openAsk(id: string) {
    this.askingCardId.set(id);
    this.askQuestion.set('');
    this.askResult.set(null);
    this.askStage.set('idle');
    this.askError.set('');
  }

  closeAsk() {
    this.askingCardId.set(null);
    this.askQuestion.set('');
    this.askResult.set(null);
    this.askStage.set('idle');
    this.askError.set('');
    this._stopThinking();
  }

  submitAsk(code: CodeJuridique) {
    if (!this.askValid()) return;
    this.askStage.set('loading');
    this.askError.set('');
    this.askResult.set(null);
    this._startThinking(THINKING_ASK);

    this.svc.askCode(this.askQuestion(), code.titre).subscribe({
      next: res => {
        this._stopThinking();
        this.askResult.set(res);
        this.askStage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.askError.set(err.error?.detail ?? 'Erreur — veuillez réessayer.');
        this.askStage.set('error');
      },
    });
  }

  onAskKeydown(e: KeyboardEvent, code: CodeJuridique) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.submitAsk(code); }
  }

  goToChat(code: CodeJuridique) {
    const q = encodeURIComponent(`Explique-moi les points clés du ${code.titre} et ses principales dispositions.`);
    window.location.href = `/dashboard/chat?q=${q}`;
  }

  // ── Recherche IA ──────────────────────────────────────────────────────────
  search() {
    if (!this.searchValid()) return;
    this.searchStage.set('loading');
    this.searchError.set('');
    this.searchResult.set(null);
    this._startThinking(THINKING_SEARCH);

    this.svc.search(this.searchQuery()).subscribe({
      next: res => {
        this._stopThinking();
        this.searchResult.set(res);
        this.searchStage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.searchError.set(err.error?.detail ?? 'Erreur de recherche — veuillez réessayer.');
        this.searchStage.set('error');
      },
    });
  }

  resetSearch() {
    this.searchStage.set('idle');
    this.searchResult.set(null);
    this.searchError.set('');
    this.searchQuery.set('');
    this._stopThinking();
  }

  onSearchKey(e: KeyboardEvent) {
    if (e.key === 'Enter') this.search();
  }

  // ── Helpers CSS ───────────────────────────────────────────────────────────
  catColor(cat: string): string   { return CAT_CONFIG[cat]?.color ?? '#64748b'; }
  catIcon(cat: string): string    { return CAT_CONFIG[cat]?.icon ?? 'file'; }

  importanceBadge(i: string): { label: string; cls: string } {
    return {
      'Fondamental': { label: 'Fondamental', cls: 'enc-imp--fondamental' },
      'Majeur':      { label: 'Majeur',      cls: 'enc-imp--majeur'      },
      'Spécialisé':  { label: 'Spécialisé',  cls: 'enc-imp--specialise'  },
    }[i] ?? { label: i, cls: '' };
  }

  scorePercent(score: number): number { return Math.round(Math.min(score * 100, 100)); }

  // ── Thinking ──────────────────────────────────────────────────────────────
  private _startThinking(messages: string[]) {
    this.thinkingMessages = messages;
    this.thinkingStep.set(0);
    this._timer = setInterval(() => {
      this.thinkingStep.update(s => s < messages.length - 1 ? s + 1 : s);
    }, 2200);
  }

  private _stopThinking() {
    clearInterval(this._timer);
    if (this.thinkingMessages.length > 0)
      this.thinkingStep.set(this.thinkingMessages.length - 1);
  }
}

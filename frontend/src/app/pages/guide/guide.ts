import { Component, signal, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule }                                 from '@angular/common';
import { RouterLink }                                   from '@angular/router';
import { Header }                                       from '../../components/header/header';
import { Footer }                                       from '../../components/footer/footer';
import { GuideIcon }                                    from './guide-icon';

@Component({
  selector:    'app-guide',
  imports:     [CommonModule, RouterLink, Header, Footer, GuideIcon],
  templateUrl: './guide.html',
  styleUrl:    './guide.scss',
})
export class Guide implements AfterViewInit, OnDestroy {
  activeSection = signal<string>('demarrage');
  openTip       = signal<number | null>(null);
  sidebarOpen   = signal(false);
  private observer!: IntersectionObserver;

  readonly builtinAgents = [
    {
      id: 'jurisprudence',
      name: 'Jurisprudence Générale',
      icon: 'scale',
      category: 'Droit général',
      description: 'Agent polyvalent couvrant tous les domaines du droit guinéen. Idéal pour les questions multi-disciplinaires ou quand vous n\'êtes pas sûr du domaine applicable.',
      useCase: 'Questions générales, droit constitutionnel, procédures judiciaires',
    },
    {
      id: 'matrimonial',
      name: 'Droit Matrimonial',
      icon: 'heart',
      category: 'Droit de la famille',
      description: 'Spécialisé dans le droit de la famille guinéen : mariage, divorce, succession, filiation, tutelle, adoption, régimes matrimoniaux.',
      useCase: 'Divorce, garde d\'enfants, héritage, pension alimentaire',
    },
    {
      id: 'penal',
      name: 'Droit Pénal',
      icon: 'alert',
      category: 'Droit pénal',
      description: 'Expert en droit pénal guinéen : infractions, peines, procédure pénale, garde à vue, détention provisoire, légitime défense.',
      useCase: 'Droits lors d\'une arrestation, peines applicables, récidive',
    },
    {
      id: 'commercial',
      name: 'Droit Commercial',
      icon: 'building',
      category: 'Droit commercial',
      description: 'Couvre le droit des affaires guinéen et l\'espace OHADA : sociétés, contrats commerciaux, faillite, concurrence, marques, investissements.',
      useCase: 'Création d\'entreprise, contrats, litiges commerciaux',
    },
    {
      id: 'travail',
      name: 'Droit du Travail',
      icon: 'briefcase',
      category: 'Droit du travail',
      description: 'Expert en Code du travail guinéen L-2014-072 : licenciement, préavis, indemnités, congés, sécurité au travail, syndicats, salaire minimum.',
      useCase: 'Licenciement abusif, calcul d\'indemnités, harcèlement au travail',
    },
    {
      id: 'immobilier',
      name: 'Droit Immobilier',
      icon: 'home',
      category: 'Droit foncier',
      description: 'Spécialisé dans le Code foncier guinéen : acquisition de terrains, baux, immatriculation, servitudes, expropriation, terres coutumières.',
      useCase: 'Litige foncier, bail, achat de terrain, bornage',
    },
    {
      id: 'ohada',
      name: 'Droit OHADA',
      icon: 'handshake',
      category: 'Droit des affaires',
      description: 'Agent dédié aux actes uniformes OHADA : sociétés, sûretés, procédures collectives, arbitrage et contentieux des affaires en Afrique.',
      useCase: 'SARL/SA OHADA, procédures collectives, contrats commerciaux transfrontaliers',
    },
    {
      id: 'environnement',
      name: 'Droit de l\'Environnement',
      icon: 'leaf',
      category: 'Droit environnemental',
      description: 'Couvre la protection de l\'environnement, les obligations des entreprises, les autorisations et les contentieux environnementaux en Guinée.',
      useCase: 'Impact environnemental, pollution, permis d\'exploitation, sanctions',
    },
  ];

  readonly sections = [
    { id: 'demarrage',  label: 'Démarrage rapide',        icon: 'rocket'   },
    { id: 'assistant',  label: 'Assistant IA',            icon: 'bot'      },
    { id: 'agents',     label: 'Agents spécialisés',      icon: 'scale'    },
    { id: 'dossiers',   label: 'Gestion des dossiers',    icon: 'folder'   },
    { id: 'documents',  label: 'Documents & Résumés',     icon: 'file'     },
    { id: 'generation', label: 'Génération de contrats',  icon: 'pen'      },
    { id: 'agenda',     label: 'Agenda juridique',        icon: 'calendar' },
    { id: 'power',      label: 'Astuces avancées',        icon: 'zap'      },
    { id: 'plans',      label: 'Plans & Fonctionnalités', icon: 'gem'      },
  ];

  readonly tips = [
    {
      title: 'Formulez des questions précises',
      body:  'Au lieu de "droits au travail", demandez "Quels sont les droits d\'un employé en CDI licencié sans motif valable après 3 ans d\'ancienneté selon le Code du travail guinéen ?"',
    },
    {
      title: 'Citez les parties concernées',
      body:  'Mentionnez les parties impliquées (employeur/salarié, bailleur/locataire, vendeur/acheteur) pour obtenir une réponse ciblée sur votre situation spécifique.',
    },
    {
      title: 'Précisez le contexte géographique',
      body:  'JusticIA est spécialisé dans le droit guinéen. Précisez "en Guinée" dans vos questions pour activer le retrieval sur les textes législatifs guinéens.',
    },
    {
      title: 'Utilisez les agents thématiques',
      body:  'Choisissez l\'agent adapté à votre domaine (Pénal, Travail, Foncier…) plutôt que l\'agent général. L\'agent thématique a un prompt optimisé pour son domaine.',
    },
    {
      title: 'Posez des questions de suivi',
      body:  'Après une première réponse, approfondissez : "Quelle est la procédure pour saisir le tribunal du travail ?" ou "Quel délai de prescription s\'applique ici ?"',
    },
    {
      title: 'Sauvegardez dans un dossier',
      body:  'Créez un dossier pour chaque affaire et attachez-y vos conversations et documents. L\'IA peut analyser vos pièces jointes dans le contexte du dossier.',
    },
  ];

  ngAfterViewInit() {
    this.observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) this.activeSection.set(e.target.id); }),
      { rootMargin: '-20% 0px -65% 0px' }
    );
    this.sections.forEach(s => {
      const el = document.getElementById(s.id);
      if (el) this.observer.observe(el);
    });
  }

  scrollTo(id: string) {
    this.sidebarOpen.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  toggleSidebar() {
    this.sidebarOpen.update(v => !v);
  }

  activeSectionLabel(): string {
    return this.sections.find(s => s.id === this.activeSection())?.label ?? 'Guide';
  }

  toggleTip(i: number) {
    this.openTip.set(this.openTip() === i ? null : i);
  }

  ngOnDestroy() { if (this.observer) this.observer.disconnect(); }
}

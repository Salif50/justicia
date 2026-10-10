import {
  Component, signal, computed, inject, OnDestroy, OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { EncyclopediaService, AskCodeResponse } from '../../services/encyclopedia.service';
import { ProcedureService } from '../../services/procedure.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

// ── Types ─────────────────────────────────────────────────────────────────────
type AskStage  = 'idle' | 'loading' | 'done' | 'error';

interface Etape {
  num:         number;
  titre:       string;
  description: string;
  duree?:      string;
  cout?:       string;
  lieu?:       string;
  optionnel?:  boolean;
}

interface Demarche {
  id:           string;
  titre:        string;
  categorie:    string;
  icon:         string;
  description:  string;
  duree_totale: string;
  cout_estime:  string;
  difficulte:   'Facile' | 'Moyen' | 'Complexe';
  urgence?:     boolean;
  docs_requis:  string[];
  etapes:       Etape[];
  conseil:      string;
  base_legale:  string;
  questions_ia: string[];
}

// ── Données de secours (utilisées si l'API échoue) ────────────────────────────
const DEMARCHES_FALLBACK: Demarche[] = [
  {
    id: 'divorce',
    titre: 'Demander le divorce',
    categorie: 'Famille',
    icon: 'heart-broken',
    description: 'Procédure de dissolution du lien conjugal devant le tribunal de première instance.',
    duree_totale: '3 à 12 mois',
    cout_estime: '500 000 – 2 000 000 FG',
    difficulte: 'Complexe',
    base_legale: 'Code civil guinéen, Art. 303-380',
    docs_requis: ['Acte de mariage', 'Actes de naissance des enfants', 'Pièces d\'identité des deux époux', 'Justificatif de domicile', 'Inventaire des biens communs'],
    etapes: [
      { num: 1, titre: 'Consultation d\'un avocat', description: 'Consultez un avocat inscrit au Barreau de Guinée pour évaluer votre situation et définir la cause du divorce (consentement mutuel, faute, séparation de fait).', duree: '1-2 semaines', lieu: 'Cabinet d\'avocat' },
      { num: 2, titre: 'Constitution du dossier', description: 'Rassemblez tous les documents nécessaires. Votre avocat vous indiquera précisément les pièces requises selon la cause du divorce invoquée.', duree: '1-2 semaines' },
      { num: 3, titre: 'Dépôt de la requête au greffe', description: 'Votre avocat dépose la requête en divorce au greffe du Tribunal de Première Instance compétent (domicile conjugal ou de l\'époux défendeur).', duree: '1 jour', lieu: 'Tribunal de Première Instance', cout: 'Frais de greffe' },
      { num: 4, titre: 'Tentative de conciliation obligatoire', description: 'Le juge convoque les deux époux pour une tentative de conciliation. En cas d\'échec avéré, l\'instance est ouverte et l\'affaire instruite.', duree: '1-3 mois', lieu: 'Tribunal' },
      { num: 5, titre: 'Instruction et plaidoiries', description: 'Échanges de conclusions entre avocats, auditions, expertises si nécessaire. Débat contradictoire sur les faits : garde, pension, partage des biens.', duree: '3-8 mois', lieu: 'Tribunal' },
      { num: 6, titre: 'Jugement de divorce', description: 'Le tribunal prononce le divorce et statue sur ses effets : garde des enfants, pension alimentaire, liquidation du régime matrimonial.', duree: '1 audience', lieu: 'Tribunal' },
      { num: 7, titre: 'Transcription à l\'état civil', description: 'Le jugement doit être transcrit en marge de l\'acte de mariage au centre d\'état civil. Formalité qui rend le divorce opposable aux tiers.', duree: '2-4 semaines', lieu: 'Centre d\'État Civil', cout: 'Frais de transcription' },
    ],
    conseil: 'Même en cas de désaccord, tentez d\'abord une médiation familiale avant la procédure judiciaire. Cela réduit les délais, les coûts, et préserve l\'intérêt des enfants.',
    questions_ia: [
      'Quelles sont les conditions légales pour divorcer en Guinée ?',
      'Comment est calculée la pension alimentaire après un divorce ?',
      'Que se passe-t-il si l\'un des époux refuse de comparaître ?',
    ],
  },
  {
    id: 'terrain',
    titre: 'Acquérir un terrain légalement',
    categorie: 'Foncier',
    icon: 'home',
    description: 'Procédure d\'achat sécurisé d\'un terrain avec immatriculation foncière officielle.',
    duree_totale: '2 à 6 mois',
    cout_estime: 'Variable + frais officiels',
    difficulte: 'Moyen',
    base_legale: 'Code foncier et domanial, Art. 1-120',
    docs_requis: ['Pièce d\'identité', 'Titre foncier ou titre coutumier du vendeur', 'Plan de bornage signé par un géomètre', 'Quittance de paiement du prix', 'Attestation de non-litige (mairie ou préfecture)'],
    etapes: [
      { num: 1, titre: 'Vérification du titre du vendeur', description: 'Avant tout paiement, vérifiez que le vendeur dispose d\'un titre de propriété valide (TF) auprès de la Conservation Foncière. Évitez les terrains sans titre officiel.', duree: '1-2 semaines', lieu: 'Conservation Foncière' },
      { num: 2, titre: 'Bornage du terrain', description: 'Faites délimiter le terrain par un géomètre agréé. Le procès-verbal de bornage signé par les parties et les voisins est obligatoire.', duree: '1-3 semaines', cout: '200 000 – 500 000 FG', lieu: 'Sur place + bureau du géomètre' },
      { num: 3, titre: 'Rédaction de l\'acte de vente', description: 'Faites rédiger l\'acte de vente par un notaire ou un avocat. Évitez les actes sous seing privé non assistés juridiquement.', duree: '1-2 semaines', lieu: 'Notaire ou avocat', cout: 'Honoraires notariaux' },
      { num: 4, titre: 'Enregistrement de l\'acte', description: 'L\'acte de vente doit être enregistré à la Direction des Impôts dans les 3 mois de sa signature pour être opposable aux tiers.', duree: '1-4 semaines', lieu: 'Direction des Impôts', cout: 'Droits d\'enregistrement (2-5% du prix)' },
      { num: 5, titre: 'Mutation du titre foncier', description: 'Déposez le dossier complet à la Conservation Foncière pour faire transcrire le transfert de propriété et obtenir le titre à votre nom.', duree: '1-3 mois', lieu: 'Conservation Foncière', cout: 'Frais de mutation' },
      { num: 6, titre: 'Obtention du titre foncier', description: 'Récupérez le titre foncier (TF) à votre nom. Preuve inattaquable de votre propriété. Conservez-le précieusement en lieu sûr.', lieu: 'Conservation Foncière' },
    ],
    conseil: 'Ne payez jamais la totalité du prix avant l\'enregistrement de l\'acte. Méfiez-vous des vendeurs pressés ou des prix anormalement bas. Un terrain sans titre foncier clair expose à de graves risques juridiques.',
    questions_ia: [
      'Quelle est la différence entre un titre foncier et un titre coutumier en Guinée ?',
      'Comment vérifier qu\'un terrain n\'est pas litigieux à Conakry ?',
      'Quels sont les droits d\'enregistrement d\'une vente immobilière en Guinée ?',
    ],
  },
  {
    id: 'societe',
    titre: 'Créer une SARL en Guinée',
    categorie: 'Commerce',
    icon: 'building',
    description: 'Création d\'une Société à Responsabilité Limitée, forme juridique la plus courante pour les PME guinéennes.',
    duree_totale: '2 à 4 semaines',
    cout_estime: '1 500 000 – 3 000 000 FG',
    difficulte: 'Moyen',
    base_legale: 'Code des activités économiques, Acte uniforme OHADA sur les sociétés',
    docs_requis: ['Pièces d\'identité des associés', 'Casier judiciaire des associés (moins de 3 mois)', 'Justificatif du siège social', 'Statuts rédigés par notaire', 'Attestation de dépôt du capital en banque'],
    etapes: [
      { num: 1, titre: 'Rédaction des statuts', description: 'Faites rédiger les statuts par un notaire ou un avocat. Définissez l\'objet social, le capital (minimum 1 000 000 FG), la répartition des parts et les organes de direction.', duree: '3-5 jours', lieu: 'Notaire ou avocat', cout: '300 000 – 600 000 FG' },
      { num: 2, titre: 'Dépôt du capital social', description: 'Déposez le capital social sur un compte bloqué dans une banque agréée. Obtenez l\'attestation de dépôt de fonds avant tout dépôt au greffe.', duree: '1-2 jours', lieu: 'Banque commerciale' },
      { num: 3, titre: 'Immatriculation au RCCM', description: 'Déposez le dossier complet au Registre du Commerce et du Crédit Mobilier (RCCM) du Tribunal de Commerce de Conakry. Étape clé pour l\'existence légale.', duree: '3-7 jours', lieu: 'Tribunal de Commerce – RCCM', cout: 'Frais d\'immatriculation' },
      { num: 4, titre: 'Publication au Journal Officiel', description: 'Publiez un avis de constitution dans le Journal Officiel ou un journal d\'annonces légales. Obligatoire pour l\'opposabilité aux tiers.', duree: '1-2 semaines', cout: '100 000 – 200 000 FG' },
      { num: 5, titre: 'Obtention du NIF', description: 'Immatriculez la société auprès de la Direction Nationale des Impôts pour obtenir le Numéro d\'Identification Fiscale (NIF). Indispensable pour facturer.', duree: '1-3 jours', lieu: 'Direction Nationale des Impôts' },
      { num: 6, titre: 'Déclaration à l\'INSS', description: 'Enregistrez la société à l\'Institut National de Sécurité Sociale (INSS) si vous avez des salariés. Obligation légale avant toute embauche.', duree: '1-3 jours', lieu: 'INSS', optionnel: true },
    ],
    conseil: 'Choisissez des associés de confiance et définissez clairement leurs rôles dès les statuts. Prévoyez une clause de cession de parts dès le départ pour éviter les blocages en cas de mésentente.',
    questions_ia: [
      'Quel est le capital social minimum pour créer une SARL en Guinée ?',
      'Quelles sont les obligations fiscales d\'une SARL guinéenne la première année ?',
      'Comment répartir équitablement les parts sociales entre associés ?',
    ],
  },
  {
    id: 'plainte-penale',
    titre: 'Porter plainte pour une infraction',
    categorie: 'Pénal',
    icon: 'scale',
    urgence: true,
    description: 'Procédure pour signaler une infraction pénale aux autorités compétentes et déclencher des poursuites.',
    duree_totale: '1 jour à plusieurs mois',
    cout_estime: 'Gratuit (avocat optionnel)',
    difficulte: 'Facile',
    base_legale: 'Code de procédure pénale 2016, Art. 15-50',
    docs_requis: ['Pièce d\'identité', 'Tout document prouvant l\'infraction (photos, vidéos, témoins)', 'Certificat médical si coups et blessures', 'Relevés bancaires si escroquerie ou vol'],
    etapes: [
      { num: 1, titre: 'Dépôt de plainte à la police ou gendarmerie', description: 'Rendez-vous au commissariat ou à la brigade de gendarmerie du lieu de l\'infraction. Exposez les faits clairement. Un procès-verbal (PV) est dressé. Exigez impérativement une copie signée.', duree: '1-3 heures', lieu: 'Commissariat ou Gendarmerie', cout: 'Gratuit' },
      { num: 2, titre: 'Transmission au Parquet', description: 'La police transmet le PV au Procureur de la République, qui décide des suites : classement sans suite, convocation, ou saisine du juge d\'instruction.', duree: '2-4 semaines' },
      { num: 3, titre: 'Suivi des poursuites', description: 'Le Parquet peut convoquer les parties, ordonner des investigations complémentaires. En cas de faits graves, il ouvre une information judiciaire (instruction).', duree: 'Variable' },
      { num: 4, titre: 'Constitution de partie civile', description: 'Pour obtenir des dommages-intérêts, constituez-vous partie civile. Nécessite l\'assistance d\'un avocat et le dépôt d\'une consignation de frais au greffe.', duree: '1-2 semaines', lieu: 'Greffe du tribunal', cout: 'Consignation + honoraires', optionnel: true },
      { num: 5, titre: 'Audience de jugement', description: 'Si des poursuites sont engagées, l\'affaire est renvoyée devant le tribunal compétent. La victime (partie civile) peut y demander réparation du préjudice subi.', lieu: 'Tribunal compétent' },
    ],
    conseil: 'Ne tardez pas : les délais de prescription courent dès la commission des faits. En cas de violence physique, consultez un médecin et obtenez un certificat médical dans les 48 heures suivant les faits.',
    questions_ia: [
      'Quel est le délai de prescription pour porter plainte pour escroquerie en Guinée ?',
      'Puis-je porter plainte sans avocat en Guinée ?',
      'Quelle est la différence entre une plainte simple et une plainte avec constitution de partie civile ?',
    ],
  },
  {
    id: 'licenciement',
    titre: 'Contester un licenciement abusif',
    categorie: 'Travail',
    icon: 'briefcase',
    urgence: true,
    description: 'Procédure pour saisir les juridictions du travail en cas de rupture injustifiée du contrat de travail.',
    duree_totale: '3 à 18 mois',
    cout_estime: '200 000 – 800 000 FG (avocat)',
    difficulte: 'Moyen',
    base_legale: 'Code du travail 2014, Art. 172.1-172.80',
    docs_requis: ['Contrat de travail', 'Lettre de licenciement', 'Bulletins de salaire (6 derniers mois)', 'Pièce d\'identité', 'Preuves d\'ancienneté et de bonne foi'],
    etapes: [
      { num: 1, titre: 'Analyse de la légalité du licenciement', description: 'Vérifiez avec un avocat ou un syndicat si le licenciement respecte la procédure : notification écrite, motif réel et sérieux, préavis respecté, indemnités versées.', duree: '1 semaine' },
      { num: 2, titre: 'Tentative de règlement amiable', description: 'Adressez une lettre recommandée à l\'employeur pour demander votre réintégration ou une indemnité transactionnelle. Conservez toutes les réponses reçues.', duree: '2-4 semaines' },
      { num: 3, titre: 'Saisine de l\'Inspection du Travail', description: 'Si le dialogue échoue, saisissez l\'Inspection du Travail compétente. L\'inspecteur peut organiser une conciliation entre les parties.', duree: '1-2 mois', lieu: 'Direction Régionale du Travail', cout: 'Gratuit' },
      { num: 4, titre: 'Saisine du Tribunal du Travail', description: 'En cas d\'échec de la conciliation, le dossier est transmis au Tribunal du Travail. Déposez une requête avec tous les éléments du dossier.', duree: '1-2 semaines', lieu: 'Tribunal du Travail' },
      { num: 5, titre: 'Audience et jugement', description: 'Le tribunal entend les deux parties, examine les preuves et rend un jugement. En cas de licenciement abusif, il peut ordonner réintégration ou indemnité.', duree: '3-12 mois', lieu: 'Tribunal du Travail' },
    ],
    conseil: 'Agissez vite ! Le délai de prescription pour contester un licenciement est de 2 ans. Rejoignez un syndicat ou une association de travailleurs pour obtenir une aide gratuite dans vos démarches.',
    questions_ia: [
      'Qu\'est-ce qu\'un licenciement abusif selon le Code du travail guinéen ?',
      'Comment est calculée l\'indemnité de licenciement en Guinée ?',
      'Puis-je être licencié pendant ma période d\'essai sans indemnité ?',
    ],
  },
  {
    id: 'garde-enfant',
    titre: 'Obtenir la garde d\'un enfant',
    categorie: 'Famille',
    icon: 'baby',
    description: 'Procédure judiciaire pour fixer ou modifier les modalités de garde après séparation des parents.',
    duree_totale: '2 à 8 mois',
    cout_estime: '300 000 – 1 000 000 FG',
    difficulte: 'Moyen',
    base_legale: 'Code de l\'enfant guinéen, Code civil Art. 350-400',
    docs_requis: ['Acte de naissance de l\'enfant', 'Pièces d\'identité des parents', 'Justificatifs de ressources', 'Jugement de divorce (si déjà prononcé)', 'Rapport d\'enquête sociale (si demandé)'],
    etapes: [
      { num: 1, titre: 'Tentative d\'accord amiable', description: 'Essayez de vous entendre avec l\'autre parent sur la garde : résidence principale, droit de visite, pension. Un accord homologué par le juge est plus rapide et moins coûteux.', duree: '2-6 semaines' },
      { num: 2, titre: 'Saisine du tribunal', description: 'En l\'absence d\'accord, votre avocat saisit le juge aux affaires familiales par voie de requête ou d\'assignation. Exposez les raisons pour lesquelles la garde vous est favorable.', duree: '1-2 semaines', lieu: 'Tribunal de Première Instance' },
      { num: 3, titre: 'Mesures provisoires', description: 'Le juge peut fixer des mesures provisoires (résidence temporaire, droit de visite) dans l\'attente du jugement définitif, pour protéger l\'enfant.', duree: '1-2 mois', lieu: 'Tribunal' },
      { num: 4, titre: 'Enquête sociale', description: 'Le juge peut ordonner une enquête sociale pour évaluer les conditions de vie de chaque parent et l\'intérêt supérieur de l\'enfant.', duree: '1-3 mois', optionnel: true },
      { num: 5, titre: 'Audience et jugement', description: 'Le tribunal rend sa décision en tenant compte uniquement de l\'intérêt de l\'enfant. Elle fixe la résidence, le droit de visite et la pension alimentaire.', duree: '2-6 mois', lieu: 'Tribunal' },
    ],
    conseil: 'Le juge statue toujours en fonction de l\'intérêt supérieur de l\'enfant. Montrez votre implication dans son éducation, sa stabilité affective et vos capacités à subvenir à ses besoins.',
    questions_ia: [
      'Quels critères le juge guinéen utilise-t-il pour accorder la garde d\'un enfant ?',
      'Peut-on modifier un jugement de garde si la situation change ?',
      'La garde partagée est-elle reconnue par le droit guinéen ?',
    ],
  },
  {
    id: 'association',
    titre: 'Créer une association en Guinée',
    categorie: 'Commerce',
    icon: 'handshake',
    description: 'Procédure de création et de déclaration officielle d\'une association à but non lucratif en République de Guinée.',
    duree_totale: '2 à 6 semaines',
    cout_estime: '50 000 – 200 000 FG',
    difficulte: 'Facile',
    base_legale: 'Loi L/2005/013/AN relative aux associations, Art. 1-30',
    docs_requis: ['Statuts signés par les fondateurs', 'Procès-verbal de l\'assemblée constitutive', 'Liste des membres fondateurs (noms, adresses, CNI)', 'Règlement intérieur (optionnel)', 'Casier judiciaire du président'],
    etapes: [
      { num: 1, titre: 'Rédaction des statuts', description: 'Rédigez les statuts de l\'association : dénomination, objet, siège, organes dirigeants, conditions d\'adhésion, modalités de dissolution. Les statuts doivent être signés par au minimum 7 membres fondateurs.', duree: '1-2 semaines' },
      { num: 2, titre: 'Assemblée générale constitutive', description: 'Tenez une assemblée générale de constitution. Adoptez les statuts, élisez le bureau (président, secrétaire général, trésorier). Dressez un procès-verbal signé par tous les fondateurs.', duree: '1 jour' },
      { num: 3, titre: 'Dépôt du dossier à la Préfecture', description: 'Déposez le dossier au Service des Associations de la Préfecture ou du Gouvernorat de Conakry. Le récépissé de dépôt vous est remis immédiatement.', duree: '1 jour', lieu: 'Préfecture / Gouvernorat', cout: 'Frais de timbre' },
      { num: 4, titre: 'Obtention du récépissé de déclaration', description: 'Dans un délai de 30 jours, l\'autorité administrative vous délivre le récépissé officiel de déclaration. L\'association acquiert alors la personnalité juridique.', duree: '2-4 semaines', lieu: 'Préfecture' },
      { num: 5, titre: 'Publication au Journal Officiel', description: 'Pour une reconnaissance complète et une meilleure visibilité, publiez un avis de création au Journal Officiel de la République de Guinée.', duree: '1-2 semaines', cout: '30 000 – 50 000 FG', optionnel: true },
    ],
    conseil: 'L\'objet social doit être clairement défini et conforme à la loi. Évitez les objets politiques ou contraires à l\'ordre public. Un règlement intérieur bien rédigé vous évitera des conflits internes.',
    questions_ia: [
      'Combien de membres fondateurs faut-il minimum pour créer une association en Guinée ?',
      'Quelle est la différence entre une association et une ONG en Guinée ?',
      'Une association peut-elle mener des activités commerciales accessoires en Guinée ?',
    ],
  },
  {
    id: 'fiscal',
    titre: 'Contester un redressement fiscal',
    categorie: 'Fiscal',
    icon: 'chart-bar',
    urgence: true,
    description: 'Procédure pour contester une décision de l\'administration fiscale guinéenne devant les juridictions compétentes.',
    duree_totale: '3 à 24 mois',
    cout_estime: '500 000 – 3 000 000 FG',
    difficulte: 'Complexe',
    base_legale: 'Code général des impôts guinéen, Art. 625-680',
    docs_requis: ['Notification de redressement reçue', 'Comptabilité complète des exercices concernés', 'Déclarations fiscales déposées', 'Justificatifs des charges déduites', 'Correspondances avec l\'administration fiscale'],
    etapes: [
      { num: 1, titre: 'Analyse de la notification', description: 'Dès réception de la notification de redressement, analysez-la avec un expert-comptable ou un avocat fiscaliste. Vous disposez d\'un délai de 30 jours pour répondre.', duree: '1 semaine' },
      { num: 2, titre: 'Réponse à la notification', description: 'Adressez une réponse motivée à l\'administration fiscale, point par point, en fournissant toutes les preuves et justificatifs de vos dépenses et revenus.', duree: '2-4 semaines', lieu: 'Direction Nationale des Impôts', cout: 'Frais d\'avocat' },
      { num: 3, titre: 'Réunion de conciliation administrative', description: 'Demandez une réunion de conciliation avec le vérificateur et son supérieur hiérarchique. Certains ajustements peuvent être obtenus à cette étape.', duree: '1-2 mois', lieu: 'Direction des Impôts' },
      { num: 4, titre: 'Réclamation contentieuse', description: 'Si le désaccord persiste, déposez une réclamation contentieuse auprès du Directeur National des Impôts dans le délai légal prévu par le Code général des impôts.', duree: '3-6 mois' },
      { num: 5, titre: 'Recours devant le Tribunal Administratif', description: 'En cas de rejet de la réclamation, saisissez le Tribunal Administratif dans les 2 mois suivant la décision de rejet. L\'assistance d\'un avocat est indispensable.', duree: '6-18 mois', lieu: 'Tribunal Administratif', cout: 'Frais judiciaires + avocat' },
    ],
    conseil: 'Répondez toujours dans les délais légaux à toute notification fiscale. Un silence vaut acceptation tacite du redressement. Conservez impérativement toutes vos pièces comptables pendant au moins 10 ans.',
    questions_ia: [
      'Quel est le délai pour contester un redressement fiscal en Guinée ?',
      'Quels sont les droits du contribuable lors d\'un contrôle fiscal en Guinée ?',
      'Peut-on négocier avec l\'administration fiscale guinéenne pour réduire un redressement ?',
    ],
  },
  {
    id: 'nationalite',
    titre: 'Demander la nationalité guinéenne',
    categorie: 'Administratif',
    icon: 'flag',
    description: 'Procédure de naturalisation pour l\'acquisition de la nationalité guinéenne par des étrangers résidant en Guinée.',
    duree_totale: '1 à 3 ans',
    cout_estime: '500 000 – 1 500 000 FG',
    difficulte: 'Complexe',
    base_legale: 'Code de la nationalité guinéenne, Loi L/1959/ANR/017',
    docs_requis: ['Acte de naissance apostillé', 'Passeport en cours de validité', 'Preuves de résidence légale continue (5 ans minimum)', 'Casier judiciaire du pays d\'origine (apostillé)', 'Preuve d\'intégration (emploi, famille, propriété)', 'Certificat médical de non-contagion'],
    etapes: [
      { num: 1, titre: 'Vérification des conditions d\'éligibilité', description: 'Vérifiez que vous remplissez les conditions : 5 ans de résidence légale continue, bonne conduite, capacité à subvenir à vos besoins, connaissance de la langue française.', duree: '1 semaine' },
      { num: 2, titre: 'Constitution du dossier', description: 'Rassemblez tous les documents requis, faites-les traduire en français par un traducteur assermenté si nécessaire, et obtenir les apostilles auprès des autorités compétentes.', duree: '2-4 semaines', cout: 'Frais de traduction et apostille' },
      { num: 3, titre: 'Dépôt du dossier au Ministère de la Justice', description: 'Déposez le dossier complet auprès de la Direction des Affaires Civiles du Ministère de la Justice, qui procède à un premier examen de recevabilité.', duree: '1 jour', lieu: 'Ministère de la Justice – Conakry', cout: 'Frais de dossier' },
      { num: 4, titre: 'Enquête de moralité', description: 'Les services de sécurité (DNSP) effectuent une enquête de moralité et de contrôle de vos antécédents sur le territoire guinéen et dans votre pays d\'origine.', duree: '3-6 mois' },
      { num: 5, titre: 'Avis du Conseil d\'État', description: 'Le dossier est soumis au Conseil d\'État pour avis consultatif avant toute décision du Chef de l\'État.', duree: '3-12 mois', lieu: 'Conseil d\'État' },
      { num: 6, titre: 'Décret de naturalisation', description: 'Si l\'avis est favorable, un décret de naturalisation est signé par le Président de la République et publié au Journal Officiel. Vous êtes alors citoyen guinéen.', lieu: 'Présidence de la République' },
      { num: 7, titre: 'Obtention des documents guinéens', description: 'Sur présentation du décret de naturalisation, demandez votre carte nationale d\'identité et votre passeport guinéens auprès des services compétents.', duree: '2-4 semaines', lieu: 'Direction Nationale de la Police' },
    ],
    conseil: 'La naturalisationg est un acte discrétionnaire de l\'État guinéen. Aucun droit à la nationalité ne peut être revendiqué même si les conditions sont remplies. Mettez en avant votre intégration profonde dans la société guinéenne.',
    questions_ia: [
      'Quelles sont les conditions légales pour demander la nationalité guinéenne par naturalisation ?',
      'Peut-on avoir la double nationalité en Guinée ?',
      'Combien de temps faut-il résider légalement en Guinée avant de demander la naturalisation ?',
    ],
  },
  {
    id: 'permis-construire',
    titre: 'Obtenir un permis de construire',
    categorie: 'Foncier',
    icon: 'construction',
    description: 'Procédure d\'obtention du permis de construire pour les constructions neuves ou les extensions de bâtiments en Guinée.',
    duree_totale: '1 à 4 mois',
    cout_estime: '200 000 – 800 000 FG',
    difficulte: 'Moyen',
    base_legale: 'Code de l\'urbanisme guinéen, Décret D/2014/139',
    docs_requis: ['Titre de propriété ou bail légalisé', 'Plan de situation du terrain', 'Plans architecturaux signés par un architecte agréé', 'Notice descriptive des travaux', 'Devis estimatif des travaux'],
    etapes: [
      { num: 1, titre: 'Recrutement d\'un architecte agréé', description: 'Faites établir les plans de construction par un architecte inscrit à l\'Ordre des Architectes de Guinée. Les plans doivent respecter les normes d\'urbanisme locales.', duree: '2-4 semaines', cout: 'Honoraires architecte (3-5% du coût des travaux)' },
      { num: 2, titre: 'Constitution du dossier technique', description: 'Rassemblez le dossier complet : plans architecturaux en 4 exemplaires, note de calcul si bâtiment R+1 ou plus, plan d\'implantation, notice d\'hygiène et sécurité.', duree: '1 semaine' },
      { num: 3, titre: 'Dépôt à la Mairie ou Préfecture', description: 'Déposez le dossier au service urbanisme de la commune ou de la préfecture concernée. Un récépissé de dépôt vous est remis et le délai d\'instruction commence.', duree: '1 jour', lieu: 'Mairie / Préfecture', cout: 'Taxe de permis (calculée sur la surface)' },
      { num: 4, titre: 'Instruction du dossier', description: 'Les services techniques vérifient la conformité des plans avec les règles d\'urbanisme, les distances aux limites, les normes parasismiques et d\'hygiène.', duree: '1-3 mois', lieu: 'Service Urbanisme' },
      { num: 5, titre: 'Obtention du permis', description: 'Récupérez le permis de construire signé et affichez-le obligatoirement sur le chantier avant tout commencement des travaux. Sa durée de validité est de 2 ans.', lieu: 'Mairie / Préfecture' },
    ],
    conseil: 'Commencer des travaux sans permis expose à des amendes, l\'arrêt du chantier et même la démolition. Vérifiez avant tout la zone d\'urbanisme de votre terrain : certaines zones sont non aedificandi.',
    questions_ia: [
      'Quels travaux nécessitent obligatoirement un permis de construire en Guinée ?',
      'Que risque-t-on si l\'on construit sans permis en Guinée ?',
      'Comment obtenir le certificat de conformité après la construction ?',
    ],
  },
];

const CATEGORIES_CONFIG: Record<string, { icon: string; color: string }> = {
  'Famille':        { icon: 'users',       color: '#7c3aed' },
  'Foncier':        { icon: 'home',        color: '#d97706' },
  'Commerce':       { icon: 'briefcase',   color: '#FF5A00' },
  'Pénal':          { icon: 'scale',       color: '#dc2626' },
  'Travail':        { icon: 'factory',     color: '#059669' },
  'Fiscal':         { icon: 'chart-bar',   color: '#065f46' },
  'Administratif':  { icon: 'landmark',    color: '#FF8A00' },
};

const CATEGORIES = ['Toutes', ...Object.keys(CATEGORIES_CONFIG)];

const THINKING_STEPS = [
  'Lecture de la question…',
  'Consultation du Code guinéen…',
  'Analyse de la procédure…',
  'Rédaction de la réponse…',
  'Finalisation…',
];

@Component({
  selector:    'app-demarches',
  imports:     [CommonModule, UiIcon],
  templateUrl: './procedures.html',
  styleUrl:    './procedures.scss',
})
export class Procedures implements OnInit, OnDestroy {
  private router  = inject(Router);
  private svc     = inject(EncyclopediaService);
  private procSvc = inject(ProcedureService);

  readonly CATEGORIES       = CATEGORIES;
  readonly CATEGORIES_CONFIG = CATEGORIES_CONFIG;
  readonly thinkingMessages = THINKING_STEPS;

  // ── Données (chargées depuis l'API, fallback statique) ─────────────────────
  DEMARCHES    = signal<Demarche[]>([]);
  isLoading    = signal(true);
  loadError    = signal('');

  // ── Filtres ───────────────────────────────────────────────────────────────
  searchQuery      = signal('');
  selectedCategory = signal('Toutes');
  expandedId       = signal<string | null>(null);

  // ── Checklist docs ────────────────────────────────────────────────────────
  checkedDocs = signal<Record<string, string[]>>({});

  // ── Suivi étapes ──────────────────────────────────────────────────────────
  completedSteps = signal<Record<string, number[]>>({});

  // ── Q&A inline ────────────────────────────────────────────────────────────
  askingId     = signal<string | null>(null);
  askQuestion  = signal<string>('');
  askResult    = signal<AskCodeResponse | null>(null);
  askStage     = signal<AskStage>('idle');
  askError     = signal<string>('');
  thinkingStep = signal<number>(0);
  private _timer?: ReturnType<typeof setInterval>;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredDemarches = computed(() => {
    const cat = this.selectedCategory();
    const q   = this.searchQuery().toLowerCase().trim();
    return this.DEMARCHES().filter(d => {
      if (cat !== 'Toutes' && d.categorie !== cat) return false;
      if (q && !d.titre.toLowerCase().includes(q)
           && !d.description.toLowerCase().includes(q)
           && !d.etapes.some(e => e.titre.toLowerCase().includes(q))) return false;
      return true;
    });
  });

  readonly statsParCategorie = computed(() =>
    CATEGORIES.slice(1).map(cat => ({
      cat,
      count: this.DEMARCHES().filter(d => d.categorie === cat).length,
      ...CATEGORIES_CONFIG[cat],
    })).filter(s => s.count > 0)
  );

  readonly urgentCount = computed(() => this.DEMARCHES().filter(d => d.urgence).length);

  readonly isSearching = computed(() => this.searchQuery().trim().length > 0);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() {
    this.procSvc.getPublic().subscribe({
      next: items => {
        this.DEMARCHES.set(items.map(p => ({ ...p, id: p.slug })));
        this.isLoading.set(false);
      },
      error: () => {
        // Fallback sur les données statiques si l'API échoue
        this.DEMARCHES.set(DEMARCHES_FALLBACK);
        this.isLoading.set(false);
        this.loadError.set('Données chargées en mode hors-ligne.');
      },
    });
  }

  ngOnDestroy() { this._stopThinking(); }

  // ── Filtres ───────────────────────────────────────────────────────────────
  toggle(id: string) {
    if (this.expandedId() === id) {
      this.expandedId.set(null);
      this.closeAsk();
    } else {
      this.expandedId.set(id);
      this.closeAsk();
    }
  }

  selectCategory(cat: string) {
    this.selectedCategory.set(cat);
    this.expandedId.set(null);
    this.closeAsk();
    this.searchQuery.set('');
  }

  // ── Checklist documents ───────────────────────────────────────────────────
  isDocChecked(id: string, doc: string): boolean {
    return (this.checkedDocs()[id] ?? []).includes(doc);
  }

  toggleDoc(id: string, doc: string, event: Event) {
    event.stopPropagation();
    this.checkedDocs.update(m => {
      const cur = m[id] ?? [];
      return { ...m, [id]: cur.includes(doc) ? cur.filter(d => d !== doc) : [...cur, doc] };
    });
  }

  docsProgress(id: string, total: number): number {
    return Math.round(((this.checkedDocs()[id]?.length ?? 0) / total) * 100);
  }

  docsCheckedCount(id: string): number {
    return this.checkedDocs()[id]?.length ?? 0;
  }

  // ── Suivi des étapes ──────────────────────────────────────────────────────
  isStepDone(id: string, num: number): boolean {
    return (this.completedSteps()[id] ?? []).includes(num);
  }

  toggleStep(id: string, num: number, event: Event) {
    event.stopPropagation();
    this.completedSteps.update(m => {
      const cur = m[id] ?? [];
      return { ...m, [id]: cur.includes(num) ? cur.filter(n => n !== num) : [...cur, num] };
    });
  }

  stepsProgress(id: string, total: number): number {
    return Math.round(((this.completedSteps()[id]?.length ?? 0) / total) * 100);
  }

  stepsCompletedCount(id: string): number {
    return this.completedSteps()[id]?.length ?? 0;
  }

  // ── Q&A inline ────────────────────────────────────────────────────────────
  askWithQuestion(d: Demarche, question: string, event: Event) {
    event.stopPropagation();
    this.askingId.set(d.id);
    this.askQuestion.set(question);
    this.askResult.set(null);
    this.askStage.set('loading');
    this.askError.set('');
    this._startThinking();

    const q = `Dans le contexte de la démarche "${d.titre}" selon le droit guinéen (${d.base_legale}), réponds à cette question : ${question}`;
    this.svc.askCode(q, '').subscribe({
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

  closeAsk() {
    this.askingId.set(null);
    this.askQuestion.set('');
    this.askResult.set(null);
    this.askStage.set('idle');
    this.askError.set('');
    this._stopThinking();
  }

  goToChat(d: Demarche) {
    this.router.navigate(['/dashboard/chat'], {
      queryParams: { q: `Je veux des informations sur cette démarche : ${d.titre}. ${d.base_legale}.` },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  catColor(cat: string): string  { return CATEGORIES_CONFIG[cat]?.color  ?? '#64748b'; }
  catIcon(cat: string): string   { return CATEGORIES_CONFIG[cat]?.icon   ?? 'clipboard'; }

  difficulteClass(d: string): string {
    return { 'Facile': 'diff--easy', 'Moyen': 'diff--med', 'Complexe': 'diff--hard' }[d] ?? '';
  }

  private _startThinking() {
    this.thinkingStep.set(0);
    this._timer = setInterval(() => {
      this.thinkingStep.update(s => s < THINKING_STEPS.length - 1 ? s + 1 : s);
    }, 1800);
  }

  private _stopThinking() {
    clearInterval(this._timer);
    this.thinkingStep.set(THINKING_STEPS.length - 1);
  }
}

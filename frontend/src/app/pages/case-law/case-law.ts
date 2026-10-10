import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { UiIcon } from '../../components/ui-icon/ui-icon';

// ── Types ─────────────────────────────────────────────────────────────────────
interface Parties { demandeur: string; defendeur: string; }

interface Decision {
  id:           string;
  reference:    string;
  date:         string;          // ISO YYYY-MM-DD
  annee:        number;
  juridiction:  string;
  chambre:      string;
  domaine:      string;
  type:         string;          // Arrêt | Jugement | Ordonnance
  titre:        string;
  resume:       string;
  dispositif:   string;
  parties:      Parties;
  articlesLoi:  string[];
  mots_cles:    string[];
  sens:         'Favorable' | 'Défavorable' | 'Mitigé';  // pour le badge
}

// ── Données de démonstration ──────────────────────────────────────────────────
const DECISIONS: Decision[] = [
  {
    id: 'arr-2024-001',
    reference: 'Arrêt n°07/CS/CC/2024',
    date: '2024-03-15', annee: 2024,
    juridiction: 'Cour Suprême', chambre: 'Chambre Civile et Commerciale',
    domaine: 'Droit commercial', type: 'Arrêt',
    titre: 'MINAS GUINEA SARL c/ Groupe PALIMEX — Nullité de contrat pour dol',
    resume: 'Confirmation de la nullité d\'un contrat de distribution exclusive pour vice du consentement. Le dol est retenu à l\'encontre du distributeur qui avait dissimulé son insolvabilité lors de la négociation.',
    dispositif: 'Confirme le jugement n°142/2023 du Tribunal de Commerce de Conakry. Dit le contrat de distribution du 15 janvier 2022 nul et de nul effet pour dol. Condamne la société PALIMEX à restituer la somme de 450 000 000 FG avec intérêts légaux à compter du versement.',
    parties: { demandeur: 'Société MINAS GUINEA SARL', defendeur: 'Groupe PALIMEX SA' },
    articlesLoi: ['Art. 278 — Code civil (vice du consentement)', 'Art. 284 — Code civil (dol)', 'Art. 1192 — Code des activités économiques'],
    mots_cles: ['Nullité de contrat', 'Dol', 'Distribution exclusive', 'Restitution'],
    sens: 'Favorable',
  },
  {
    id: 'arr-2024-002',
    reference: 'Arrêt n°18/CA/SOC/2024',
    date: '2024-05-22', annee: 2024,
    juridiction: "Cour d'Appel de Conakry", chambre: 'Chambre Sociale',
    domaine: 'Droit du travail', type: 'Arrêt',
    titre: 'Oumar DIALLO c/ Société GUINEX — Licenciement abusif et indemnités',
    resume: 'Réformation partielle du jugement de première instance sur le montant de l\'indemnité de licenciement. La cour retient l\'abus de droit de l\'employeur et majore l\'indemnité à six mois de salaire brut.',
    dispositif: 'Réforme le jugement n°89/2023. Dit le licenciement abusif. Condamne la société GUINEX à payer à M. Oumar DIALLO la somme de 18 000 000 FG à titre d\'indemnité de licenciement abusif, outre 4 500 000 FG de préavis non respecté.',
    parties: { demandeur: 'M. Oumar DIALLO', defendeur: 'Société GUINEX Import-Export' },
    articlesLoi: ['Art. 85 — Code du travail (licenciement)', 'Art. 109 — Code du travail (indemnités)', 'Art. 152 — Code du travail (préavis)'],
    mots_cles: ['Licenciement abusif', 'Indemnité', 'Préavis', 'Abus de droit'],
    sens: 'Favorable',
  },
  {
    id: 'jug-2024-003',
    reference: 'Jugement n°234/TPI/CIV/2024',
    date: '2024-01-30', annee: 2024,
    juridiction: 'Tribunal de Première Instance de Conakry', chambre: 'Chambre Civile',
    domaine: 'Droit foncier', type: 'Jugement',
    titre: 'Famille CAMARA c/ État guinéen — Contestation d\'expropriation foncière',
    resume: 'Rejet de la demande d\'annulation d\'une décision d\'expropriation pour cause d\'utilité publique. Le tribunal constate la régularité de la procédure mais ordonne une expertise contradictoire pour réévaluer l\'indemnité de dépossession.',
    dispositif: 'Rejette la demande en annulation de l\'expropriation. Ordonne une expertise judiciaire contradictoire pour déterminer la valeur vénale du terrain au 1er octobre 2023. Surseoit à statuer sur l\'indemnisation jusqu\'au dépôt du rapport d\'expertise.',
    parties: { demandeur: 'Famille CAMARA représentée par M. Ibrahima CAMARA', defendeur: 'État de la République de Guinée' },
    articlesLoi: ['Art. 44 — Code foncier et domanial (expropriation)', 'Art. 50 — Code foncier (indemnisation)', 'Art. 13 — Constitution (droit de propriété)'],
    mots_cles: ['Expropriation', 'Utilité publique', 'Indemnisation', 'Expertise foncière'],
    sens: 'Mitigé',
  },
  {
    id: 'arr-2024-004',
    reference: 'Arrêt n°029/CS/PEN/2024',
    date: '2024-07-08', annee: 2024,
    juridiction: 'Cour Suprême', chambre: 'Chambre Pénale',
    domaine: 'Droit pénal', type: 'Arrêt',
    titre: 'Parquet général c/ Moussa KOUROUMA — Escroquerie aggravée',
    resume: 'Confirmation de la condamnation pour escroquerie aggravée commise au préjudice d\'une association de microfinance. La Cour retient la circonstance aggravante de qualité de mandataire social.',
    dispositif: 'Rejette le pourvoi en cassation formé par M. KOUROUMA. Confirme la décision de la Cour d\'appel. Dit M. Moussa KOUROUMA coupable d\'escroquerie aggravée et confirme la peine de 3 ans d\'emprisonnement ferme et la confiscation des sommes détournées.',
    parties: { demandeur: 'Ministère Public — Parquet Général', defendeur: 'M. Moussa KOUROUMA' },
    articlesLoi: ['Art. 432 — Code pénal (escroquerie)', 'Art. 434 — Code pénal (circonstances aggravantes)', 'Art. 450 — Code pénal (sanctions pécuniaires)'],
    mots_cles: ['Escroquerie', 'Aggravation', 'Microfinance', 'Pourvoi en cassation'],
    sens: 'Défavorable',
  },
  {
    id: 'jug-2024-005',
    reference: 'Jugement n°56/TT/2024',
    date: '2024-02-14', annee: 2024,
    juridiction: 'Tribunal du Travail de Conakry', chambre: 'Section Individuelle',
    domaine: 'Droit du travail', type: 'Jugement',
    titre: 'Fatoumata BALDE c/ Clinique Saint-Gabriel — Harcèlement au travail',
    resume: 'Premier jugement guinéen reconnaissant le harcèlement moral au travail comme cause de rupture aux torts exclusifs de l\'employeur. Application des principes issus du Code du travail et des conventions internationales ratifiées.',
    dispositif: 'Dit Mme BALDE fondée en sa demande. Constate la rupture du contrat de travail aux torts exclusifs de la Clinique Saint-Gabriel. Condamne la Clinique à payer : 8 500 000 FG de dommages-intérêts pour harcèlement moral ; 3 200 000 FG d\'indemnité de rupture abusive ; 1 800 000 FG de dommages-intérêts pour préjudice moral.',
    parties: { demandeur: 'Mme Fatoumata BALDE', defendeur: 'Clinique Saint-Gabriel SARL' },
    articlesLoi: ['Art. 3 — Code du travail (protection de la dignité)', 'Art. 11 — Code du travail (harcèlement)', 'Convention OIT n°190 (violence et harcèlement)'],
    mots_cles: ['Harcèlement moral', 'Dignité au travail', 'Rupture abusive', 'Convention OIT'],
    sens: 'Favorable',
  },
  {
    id: 'ord-2024-006',
    reference: 'Ordonnance n°12/TPI/REF/2024',
    date: '2024-04-03', annee: 2024,
    juridiction: 'Tribunal de Première Instance de Conakry', chambre: 'Juge des référés',
    domaine: 'Droit commercial', type: 'Ordonnance',
    titre: 'SOTELGUI SA c/ AFRICELL GUINEA — Concurrence déloyale en référé',
    resume: 'Ordonnance de référé enjoignant à un opérateur téléphonique de cesser immédiatement des pratiques commerciales jugées déloyales. Mesure conservatoire accordée au regard de l\'urgence et du préjudice manifeste.',
    dispositif: 'Dit l\'urgence caractérisée. Enjoint à AFRICELL GUINEA SA, sous astreinte de 5 000 000 FG par jour de retard, de cesser l\'affichage de toute publicité utilisant le slogan et la charte graphique identique à celle de SOTELGUI SA. Ordonne une expertise pour évaluer le préjudice.',
    parties: { demandeur: 'SOTELGUI SA', defendeur: 'AFRICELL GUINEA SA' },
    articlesLoi: ['Art. 241 — Code des activités économiques (concurrence déloyale)', 'Art. 847 — Code de procédure civile (référé)', 'Art. 248 — Code des activités économiques (astreinte)'],
    mots_cles: ['Référé', 'Concurrence déloyale', 'Astreinte', 'Propriété intellectuelle', 'Urgence'],
    sens: 'Favorable',
  },
  {
    id: 'arr-2023-007',
    reference: 'Arrêt n°41/CA/COMM/2023',
    date: '2023-11-18', annee: 2023,
    juridiction: "Cour d'Appel de Conakry", chambre: 'Chambre Commerciale',
    domaine: 'Droit commercial', type: 'Arrêt',
    titre: 'BATA GUINEA SARL c/ Héritiers FOFANA — Résolution de vente fonds de commerce',
    resume: 'Résolution d\'un contrat de vente de fonds de commerce pour inexécution des obligations de paiement du prix. La cour rejette l\'exception d\'imprévision soulevée par l\'acquéreur.',
    dispositif: 'Confirme le jugement du Tribunal de Commerce. Prononce la résolution du contrat de vente du fonds de commerce du 12 mars 2022. Ordonne la restitution du fonds à la famille BATA. Condamne les héritiers FOFANA à payer les loyers échus de 24 000 000 FG.',
    parties: { demandeur: 'BATA GUINEA SARL', defendeur: 'Héritiers FOFANA (succession de M. Sékou FOFANA)' },
    articlesLoi: ['Art. 322 — Code civil (résolution de contrat)', 'Art. 1189 — Code des activités économiques (vente de fonds de commerce)', 'Art. 196 — Code civil (force majeure)'],
    mots_cles: ['Fonds de commerce', 'Résolution de contrat', 'Imprévision', 'Non-paiement'],
    sens: 'Favorable',
  },
  {
    id: 'jug-2023-008',
    reference: 'Jugement n°178/TPI/FAM/2023',
    date: '2023-09-05', annee: 2023,
    juridiction: 'Tribunal de Première Instance de Conakry', chambre: 'Chambre de la Famille',
    domaine: 'Droit de la famille', type: 'Jugement',
    titre: 'Époux SOUMAH — Divorce pour faute et garde des enfants mineurs',
    resume: 'Divorce prononcé aux torts partagés après constat de fautes réciproques des époux. Attribution de la garde des enfants à la mère avec droit de visite et d\'hébergement au père. Fixation de la pension alimentaire.',
    dispositif: 'Prononce le divorce des époux SOUMAH aux torts partagés. Attribue la garde des 3 enfants mineurs à Mme SOUMAH. Fixe le droit de visite du père les 1er et 3e week-ends de chaque mois et la moitié des vacances scolaires. Condamne M. SOUMAH à payer une pension alimentaire de 1 500 000 FG par mois, indexée sur le coût de la vie.',
    parties: { demandeur: 'Mme Aïssatou SOUMAH née DIALLO', defendeur: 'M. Mamadou SOUMAH' },
    articlesLoi: ['Art. 348 — Code civil (divorce pour faute)', 'Art. 398 — Code civil (garde des enfants)', 'Art. 404 — Code civil (pension alimentaire)'],
    mots_cles: ['Divorce', 'Torts partagés', 'Garde des enfants', 'Pension alimentaire', 'Droit de visite'],
    sens: 'Mitigé',
  },
  {
    id: 'arr-2023-009',
    reference: 'Arrêt n°15/CS/ADM/2023',
    date: '2023-06-22', annee: 2023,
    juridiction: 'Cour Suprême', chambre: 'Chambre Administrative',
    domaine: 'Droit administratif', type: 'Arrêt',
    titre: 'BOULANGERIE KANKAN c/ Mairie de Conakry — Annulation permis de construire',
    resume: 'Annulation d\'un permis de construire accordé en violation du plan d\'urbanisme. La Cour retient le détournement de procédure et l\'absence d\'enquête publique préalable requise pour les constructions à usage industriel.',
    dispositif: 'Annule le permis de construire n°MC/2022/1847 accordé par la Mairie de Conakry le 8 novembre 2022. Dit que ladite construction doit être mise en conformité avec le plan d\'urbanisme dans un délai de 6 mois. Met les dépens à la charge de la Mairie de Conakry.',
    parties: { demandeur: 'Association des Riverains — BOULANGERIE KANKAN', defendeur: 'Mairie de Conakry et Société IMMO-INVEST' },
    articlesLoi: ['Art. 127 — Code de l\'urbanisme (permis de construire)', 'Art. 56 — Code de l\'environnement (enquête publique)', 'Art. 2 — Loi sur l\'organisation judiciaire (compétence administrative)'],
    mots_cles: ['Permis de construire', 'Urbanisme', 'Annulation', 'Enquête publique', 'Détournement de procédure'],
    sens: 'Favorable',
  },
  {
    id: 'jug-2023-010',
    reference: 'Jugement n°92/TCO/2023',
    date: '2023-04-11', annee: 2023,
    juridiction: 'Tribunal de Commerce de Conakry', chambre: 'Section Commerciale',
    domaine: 'Droit commercial', type: 'Jugement',
    titre: 'TRANSFERT MONEY GN c/ Banque BICIGUI — Responsabilité bancaire',
    resume: 'Engagement de la responsabilité d\'une banque pour exécution fautive d\'un ordre de virement. La banque n\'a pas vérifié les coordonnées bancaires du bénéficiaire, causant un préjudice financier important à son client.',
    dispositif: 'Dit la Banque BICIGUI responsable du préjudice subi par la société TRANSFERT MONEY GN. Condamne la banque à payer la somme de 75 000 000 FG en réparation du préjudice direct, et 15 000 000 FG de dommages-intérêts pour le préjudice d\'exploitation.',
    parties: { demandeur: 'Société TRANSFERT MONEY GN SARL', defendeur: 'BICIGUI — Banque Internationale pour le Commerce et l\'Industrie en Guinée' },
    articlesLoi: ['Art. 98 — Loi sur les établissements de crédit (responsabilité)', 'Art. 23 — Code des activités économiques (obligations de diligence)', 'Art. 1240 — Code civil (responsabilité délictuelle)'],
    mots_cles: ['Responsabilité bancaire', 'Virement', 'Faute de la banque', 'Préjudice financier'],
    sens: 'Favorable',
  },
  {
    id: 'arr-2022-011',
    reference: 'Arrêt n°33/CA/PEN/2022',
    date: '2022-12-01', annee: 2022,
    juridiction: "Cour d'Appel de Conakry", chambre: 'Chambre Pénale',
    domaine: 'Droit pénal', type: 'Arrêt',
    titre: 'Parquet c/ Mamadou BALDE — Trafic de ressources minières',
    resume: 'Condamnation pour exportation illégale de concentré de bauxite sans titre minier ni licence d\'exportation. Application de l\'aggravation prévue par le Code minier pour les infractions commises en bande organisée.',
    dispositif: 'Confirme la culpabilité de M. BALDE pour trafic de ressources minières. Ramène la peine à 4 ans dont 2 avec sursis. Confirme la confiscation de 12 camions et du matériel d\'extraction. Prononce une amende de 500 000 000 FG au profit du Trésor public.',
    parties: { demandeur: 'Ministère Public', defendeur: 'M. Mamadou BALDE et consorts (6 co-prévenus)' },
    articlesLoi: ['Art. 196 — Code minier (exploitation illégale)', 'Art. 203 — Code minier (sanctions)', 'Art. 154 — Code pénal (bande organisée)'],
    mots_cles: ['Ressources minières', 'Exploitation illégale', 'Bauxite', 'Bande organisée', 'Confiscation'],
    sens: 'Défavorable',
  },
  {
    id: 'jug-2022-012',
    reference: 'Jugement n°67/TT/2022',
    date: '2022-08-30', annee: 2022,
    juridiction: 'Tribunal du Travail de Conakry', chambre: 'Section Collective',
    domaine: 'Droit du travail', type: 'Jugement',
    titre: 'SYNDICAT NATIONAL DES MINES c/ Compagnie Minière SMFG',
    resume: 'Annulation d\'une procédure de licenciement collectif pour motif économique, faute de consultation préalable des délégués du personnel. Le tribunal ordonne la réintégration des 47 salariés concernés.',
    dispositif: 'Annule la procédure de licenciement collectif initiée par la SMFG. Ordonne la réintégration des 47 salariés licenciés dans leurs postes respectifs. Condamne la SMFG à verser à chaque salarié l\'équivalent de 6 mois de salaire brut en réparation du préjudice subi.',
    parties: { demandeur: 'SYNDICAT NATIONAL DES MINES DE GUINÉE', defendeur: 'Société Minière et Financière de Guinée — SMFG SA' },
    articlesLoi: ['Art. 112 — Code du travail (licenciement collectif)', 'Art. 134 — Code du travail (consultation des délégués)', 'Art. 108 — Code du travail (motif économique)'],
    mots_cles: ['Licenciement collectif', 'Syndicat', 'Réintégration', 'Délégués du personnel', 'Industrie minière'],
    sens: 'Favorable',
  },
  {
    id: 'arr-2022-013',
    reference: 'Arrêt n°04/CS/SOC/2022',
    date: '2022-03-17', annee: 2022,
    juridiction: 'Cour Suprême', chambre: 'Chambre Sociale',
    domaine: 'Droit du travail', type: 'Arrêt',
    titre: 'Alpha BARRY c/ Société EDF-GUINEA — Accident du travail et faute inexcusable',
    resume: 'Reconnaissance de la faute inexcusable de l\'employeur dans un accident du travail grave ayant causé une invalidité permanente. Majoration de la rente et réparation intégrale du préjudice.',
    dispositif: 'Casse et annule l\'arrêt n°28/CA/2021. Statuant à nouveau, dit l\'accident du travail survenu le 14 juin 2020 imputable à la faute inexcusable d\'EDF-GUINEA. Ordonne la majoration de la rente à son taux maximum. Condamne EDF-GUINEA à payer 120 000 000 FG en réparation du préjudice définitif.',
    parties: { demandeur: 'M. Alpha BARRY', defendeur: 'Société EDF-GUINEA SA' },
    articlesLoi: ['Art. 241 — Code de sécurité sociale (accident du travail)', 'Art. 248 — Code de sécurité sociale (faute inexcusable)', 'Art. 255 — Code de sécurité sociale (majoration de rente)'],
    mots_cles: ['Accident du travail', 'Faute inexcusable', 'Invalidité', 'Rente', 'Réparation intégrale'],
    sens: 'Favorable',
  },
  {
    id: 'jug-2023-014',
    reference: 'Jugement n°45/TPI/ENV/2023',
    date: '2023-02-08', annee: 2023,
    juridiction: 'Tribunal de Première Instance de Conakry', chambre: 'Chambre Correctionnelle',
    domaine: 'Droit de l\'environnement', type: 'Jugement',
    titre: 'Agence Guinéenne pour l\'Environnement c/ Société PLASTIQUES-GN — Pollution maritime',
    resume: 'Condamnation d\'une société industrielle pour déversement d\'effluents chimiques dans la baie de Conakry en violation du Code de l\'environnement. Première application en Guinée du principe pollueur-payeur.',
    dispositif: 'Dit la société PLASTIQUES-GN coupable d\'infractions à la loi environnementale. Prononce une amende de 200 000 000 FG. Ordonne la mise en place immédiate d\'un système de traitement des effluents sous contrôle de l\'AGE. Condamne à la dépollution des zones affectées sous astreinte de 2 000 000 FG par semaine de retard.',
    parties: { demandeur: 'Agence Guinéenne pour l\'Environnement (AGE)', defendeur: 'Société PLASTIQUES-GN SARL' },
    articlesLoi: ['Art. 78 — Code de la protection de l\'environnement (pollution)', 'Art. 97 — Code de la protection (sanctions)', 'Art. 18 — Constitution (droit à un environnement sain)'],
    mots_cles: ['Pollution', 'Environnement', 'Pollueur-payeur', 'Déversement chimique', 'Baie de Conakry'],
    sens: 'Défavorable',
  },
  {
    id: 'arr-2024-015',
    reference: 'Arrêt n°52/CA/CIV/2024',
    date: '2024-09-10', annee: 2024,
    juridiction: "Cour d'Appel de Conakry", chambre: 'Chambre Civile',
    domaine: 'Droit civil', type: 'Arrêt',
    titre: 'Succession KOUYATE — Partage d\'héritage et droits de la veuve',
    resume: 'Réaffirmation des droits successoraux de la veuve face aux prétentions de la famille du défunt. Application du droit civil guinéen en matière successorale, en accord avec les engagements internationaux de la Guinée sur l\'égalité des droits.',
    dispositif: 'Infirme le jugement de première instance. Dit Mme KOUYATE héritière de son époux pour un quart de la succession conformément aux dispositions du Code civil. Ordonne le partage de la masse successorale incluant le bien immobilier sis à Ratoma. Nomme un notaire liquidateur.',
    parties: { demandeur: 'Mme Kadiatou KOUYATE née SYLLA (veuve)', defendeur: 'Famille KOUYATE représentée par M. El Hadj KOUYATE (frère du défunt)' },
    articlesLoi: ['Art. 718 — Code civil (succession)', 'Art. 757 — Code civil (droits du conjoint survivant)', 'Art. 767 — Code civil (partage)', 'Art. 16 — Constitution (égalité hommes-femmes)'],
    mots_cles: ['Succession', 'Droits de la veuve', 'Partage d\'héritage', 'Égalité', 'Bien immobilier'],
    sens: 'Favorable',
  },
  {
    id: 'jug-2024-016',
    reference: 'Jugement n°112/TCO/2024',
    date: '2024-06-19', annee: 2024,
    juridiction: 'Tribunal de Commerce de Conakry', chambre: 'Section des Sociétés',
    domaine: 'Droit commercial', type: 'Jugement',
    titre: 'Actionnaires minoritaires c/ GUINÉE TELECOM SA — Abus de majorité',
    resume: 'Condamnation d\'actionnaires majoritaires pour abus de majorité dans une assemblée générale ayant voté une augmentation de capital diluante au détriment des minoritaires. Première décision notable sur la gouvernance des sociétés anonymes en Guinée.',
    dispositif: 'Dit les délibérations de l\'AGE du 22 octobre 2023 nulles et de nul effet pour abus de majorité. Annule l\'augmentation de capital décidée. Condamne les actionnaires majoritaires à payer aux minoritaires la somme de 45 000 000 FG de dommages-intérêts pour le préjudice subi.',
    parties: { demandeur: 'Groupement des Actionnaires Minoritaires de GUINÉE TELECOM', defendeur: 'GUINÉE TELECOM SA représentée par son Directeur Général' },
    articlesLoi: ['Art. 890 — Code des activités économiques (assemblée générale)', 'Art. 894 — Code des activités économiques (abus de majorité)', 'Art. 875 — Code des activités économiques (augmentation de capital)'],
    mots_cles: ['Abus de majorité', 'Actionnaires minoritaires', 'Assemblée générale', 'Gouvernance', 'Augmentation de capital'],
    sens: 'Favorable',
  },
];

const JURIDICTIONS  = ['Toutes', ...Array.from(new Set(DECISIONS.map(d => d.juridiction))).sort()];
const DOMAINES      = ['Tous',   ...Array.from(new Set(DECISIONS.map(d => d.domaine))).sort()];
const TYPES_DEC     = ['Tous',   'Arrêt', 'Jugement', 'Ordonnance'];
const ANNEES        = ['Toutes', ...Array.from(new Set(DECISIONS.map(d => d.annee))).sort((a, b) => b - a).map(String)];

const JURIDICTION_ICONS: Record<string, string> = {
  'Cour Suprême':                                  'scale',
  "Cour d'Appel de Conakry":                       'landmark',
  'Tribunal de Première Instance de Conakry':       'clipboard',
  'Tribunal du Travail de Conakry':                 'briefcase',
  'Tribunal de Commerce de Conakry':                'store',
};

@Component({
  selector:    'app-case-law',
  imports:     [CommonModule, FormsModule, UiIcon],
  templateUrl: './case-law.html',
  styleUrl:    './case-law.scss',
})
export class CaseLaw {
  private router = inject(Router);

  readonly DECISIONS    = DECISIONS;
  readonly JURIDICTIONS = JURIDICTIONS;
  readonly DOMAINES     = DOMAINES;
  readonly TYPES        = TYPES_DEC;
  readonly ANNEES       = ANNEES;

  // ── Filtres ───────────────────────────────────────────────────────────────
  searchQuery    = signal('');
  filterJurid    = signal('Toutes');
  filterDomaine  = signal('Tous');
  filterType     = signal('Tous');
  filterAnnee    = signal('Toutes');
  filterSens     = signal('Tous');  // Favorable | Défavorable | Mitigé | Tous

  // ── Vue ───────────────────────────────────────────────────────────────────
  viewMode    = signal<'list' | 'grid'>('list');
  expandedId  = signal<string | null>(null);
  showFilters = signal(true);

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredDecisions = computed(() => {
    const q    = this.searchQuery().toLowerCase().trim();
    const jurid = this.filterJurid();
    const dom   = this.filterDomaine();
    const type  = this.filterType();
    const annee = this.filterAnnee();
    const sens  = this.filterSens();

    return DECISIONS.filter(d => {
      if (jurid !== 'Toutes' && d.juridiction !== jurid) return false;
      if (dom   !== 'Tous'   && d.domaine     !== dom)   return false;
      if (type  !== 'Tous'   && d.type        !== type)  return false;
      if (annee !== 'Toutes' && d.annee       !== Number(annee)) return false;
      if (sens  !== 'Tous'   && d.sens        !== sens)  return false;
      if (q) {
        const haystack = [d.titre, d.resume, d.reference, d.parties.demandeur, d.parties.defendeur, ...d.mots_cles].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  });

  readonly activeFiltersCount = computed(() => {
    let n = 0;
    if (this.filterJurid()   !== 'Toutes') n++;
    if (this.filterDomaine() !== 'Tous')   n++;
    if (this.filterType()    !== 'Tous')   n++;
    if (this.filterAnnee()   !== 'Toutes') n++;
    if (this.filterSens()    !== 'Tous')   n++;
    return n;
  });

  readonly statsParJuridiction = computed(() => {
    const map = new Map<string, number>();
    DECISIONS.forEach(d => map.set(d.juridiction, (map.get(d.juridiction) ?? 0) + 1));
    return Array.from(map.entries()).map(([j, n]) => ({ juridiction: j, count: n })).sort((a, b) => b.count - a.count);
  });

  // ── Actions ───────────────────────────────────────────────────────────────
  toggleExpand(id: string) {
    this.expandedId.set(this.expandedId() === id ? null : id);
  }

  resetFilters() {
    this.filterJurid.set('Toutes');
    this.filterDomaine.set('Tous');
    this.filterType.set('Tous');
    this.filterAnnee.set('Toutes');
    this.filterSens.set('Tous');
    this.searchQuery.set('');
  }

  analyzeWithAI(d: Decision) {
    const q = `Analyse juridiquement la décision suivante : ${d.reference} — ${d.titre}. Quels sont les principes juridiques appliqués et les articles de loi pertinents ?`;
    this.router.navigate(['/dashboard/chat'], { queryParams: { q } });
  }

  findSimilar(d: Decision) {
    const q = `Trouve-moi des décisions ou des principes juridiques similaires à : ${d.titre}. Domaine : ${d.domaine}.`;
    this.router.navigate(['/dashboard/chat'], { queryParams: { q } });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  juridictionIcon(j: string): string { return JURIDICTION_ICONS[j] ?? 'scale'; }

  typeClass(type: string): string {
    return { 'Arrêt': 'cl-type--arret', 'Jugement': 'cl-type--jugement', 'Ordonnance': 'cl-type--ordonnance' }[type] ?? '';
  }

  sensClass(sens: string): string {
    return { 'Favorable': 'cl-sens--fav', 'Défavorable': 'cl-sens--def', 'Mitigé': 'cl-sens--mit' }[sens] ?? '';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-GN', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}

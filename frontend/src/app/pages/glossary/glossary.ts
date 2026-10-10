import {
  Component, signal, computed, inject, OnDestroy,
} from '@angular/core';
import { CommonModule, NgTemplateOutlet, SlicePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { EncyclopediaService, AskCodeResponse } from '../../services/encyclopedia.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewMode  = 'alpha' | 'domain' | 'list';
type AskStage  = 'idle' | 'loading' | 'done' | 'error';

interface GlossaryTerm {
  terme:      string;
  definition: string;
  domaine:    string;
  exemple?:   string;
  loi?:       string;
  related?:   string[];
}

// ── Données ───────────────────────────────────────────────────────────────────
const TERMES: GlossaryTerm[] = [
  // ── Procédure ──────────────────────────────────────────────────────────────
  { terme: 'Acquittement',       domaine: 'Procédure', loi: 'Art. 373 — Code de procédure pénale', related: ['Mise en examen', 'Instruction judiciaire'], definition: 'Décision judiciaire par laquelle une personne accusée est déclarée non coupable des faits qui lui étaient reprochés et est mise hors de cause.', exemple: 'Le tribunal a prononcé l\'acquittement faute de preuves suffisantes.' },
  { terme: 'Action en justice',  domaine: 'Procédure', loi: 'Art. 30 — Code de procédure civile',  related: ['Assignation', 'Audience'], definition: 'Droit reconnu à toute personne de saisir un tribunal pour faire valoir ses droits ou défendre ses intérêts légitimes.' },
  { terme: 'Appel',              domaine: 'Procédure', loi: 'Art. 538 — Code de procédure civile', related: ['Pourvoi en cassation', 'Jugement'], definition: 'Voie de recours ordinaire permettant à une partie condamnée de faire rejuger son affaire par une juridiction supérieure (Cour d\'appel).', exemple: 'L\'employeur a interjeté appel du jugement du Tribunal du travail dans le délai d\'un mois.' },
  { terme: 'Assignation',        domaine: 'Procédure', loi: 'Art. 55 — Code de procédure civile',  related: ['Audience', 'Action en justice'], definition: 'Acte par lequel une partie cite son adversaire à comparaître devant un tribunal, rédigé par un huissier de justice.' },
  { terme: 'Audience',           domaine: 'Procédure', loi: 'Art. 401 — Code de procédure civile', related: ['Jugement', 'Assignation'], definition: 'Séance publique tenue par un tribunal au cours de laquelle sont examinées les affaires portées devant lui.' },
  { terme: 'Avocat',             domaine: 'Procédure', related: ['Barreau', 'Mandat'], definition: 'Professionnel du droit inscrit au barreau, habilité à représenter et défendre les parties en justice et à les conseiller juridiquement.' },
  { terme: 'Barreau',            domaine: 'Procédure', related: ['Avocat'], definition: 'Ordre professionnel regroupant les avocats d\'une juridiction. En Guinée, le Barreau National de Guinée régit la profession et assure la déontologie.' },
  { terme: 'Huissier de justice', domaine: 'Procédure', related: ['Assignation', 'Saisie'], definition: 'Officier ministériel chargé de signifier les actes judiciaires et d\'exécuter les décisions de justice (saisies, expulsions, constats).' },
  { terme: 'Jugement',           domaine: 'Procédure', loi: 'Art. 413 — Code de procédure civile', related: ['Appel', 'Décision de justice'], definition: 'Décision rendue par une juridiction du premier degré (tribunal) qui tranche le litige soumis par les parties.', exemple: 'Le jugement du tribunal de première instance a condamné le défendeur à verser des dommages-intérêts.' },
  { terme: 'Mandat',             domaine: 'Procédure', loi: 'Art. 122 — Code de procédure pénale', related: ['Garde à vue', 'Instruction judiciaire'], definition: 'Ordre écrit délivré par un juge prescrivant un acte de procédure, notamment la comparution, l\'arrestation ou la détention d\'une personne.' },
  { terme: 'Pourvoi en cassation', domaine: 'Procédure', loi: 'Art. 604 — Code de procédure civile', related: ['Appel', 'Cour Suprême'], definition: 'Recours extraordinaire porté devant la Cour Suprême pour faire censurer une décision définitive contraire à la loi, sans rejuger les faits.' },
  { terme: 'Signification',      domaine: 'Procédure', related: ['Assignation', 'Huissier de justice'], definition: 'Acte par lequel un huissier de justice porte officiellement à la connaissance d\'une personne un acte de procédure ou une décision judiciaire.' },

  // ── Pénal ──────────────────────────────────────────────────────────────────
  { terme: 'Circonstances atténuantes', domaine: 'Pénal', loi: 'Art. 53 — Code pénal', related: ['Circonstances aggravantes', 'Récidive'], definition: 'Éléments de fait ou de personnalité qui conduisent le juge à prononcer une peine inférieure au maximum légal.' },
  { terme: 'Circonstances aggravantes', domaine: 'Pénal', loi: 'Art. 55 — Code pénal', related: ['Circonstances atténuantes', 'Récidive'], definition: 'Éléments qui alourdissent la peine normalement applicable à une infraction, tels que la préméditation, l\'usage d\'une arme ou la qualité de la victime.' },
  { terme: 'Complicité',         domaine: 'Pénal', loi: 'Art. 27 — Code pénal', related: ['Crime', 'Délit'], definition: 'Participation à une infraction commise par autrui, par aide, assistance ou provocation. Le complice est passible des mêmes peines que l\'auteur principal.' },
  { terme: 'Contravention',      domaine: 'Pénal', loi: 'Art. 15 — Code pénal', related: ['Délit', 'Crime'], definition: 'Infraction la moins grave dans la classification tripartite (contravention, délit, crime), punie d\'une amende de police.' },
  { terme: 'Crime',              domaine: 'Pénal', loi: 'Art. 13 — Code pénal', related: ['Délit', 'Réclusion criminelle'], definition: 'Infraction la plus grave, jugée par la Cour d\'assises, punie d\'une peine criminelle pouvant aller jusqu\'à la perpétuité.' },
  { terme: 'Délit',              domaine: 'Pénal', loi: 'Art. 14 — Code pénal', related: ['Crime', 'Contravention'], definition: 'Infraction de gravité intermédiaire, jugée par le tribunal correctionnel, punie d\'un emprisonnement et/ou d\'une amende.', exemple: 'L\'escroquerie est un délit puni de deux à cinq ans d\'emprisonnement selon le Code pénal guinéen.' },
  { terme: 'Flagrant délit',     domaine: 'Pénal', loi: 'Art. 59 — Code de procédure pénale', related: ['Garde à vue', 'Mise en examen'], definition: 'Infraction qui est en train de se commettre ou qui vient d\'être commise. Ce constat permet une procédure d\'urgence simplifiée.' },
  { terme: 'Garde à vue',        domaine: 'Pénal', loi: 'Art. 74 — Code de procédure pénale', related: ['Mise en examen', 'Instruction judiciaire'], definition: 'Mesure privative de liberté permettant de retenir une personne dans les locaux de police pour les besoins d\'une enquête pénale.', exemple: 'La durée de la garde à vue ne peut excéder 48 heures, renouvelable une fois sur autorisation du Procureur.' },
  { terme: 'Homicide involontaire', domaine: 'Pénal', loi: 'Art. 231 — Code pénal', related: ['Crime', 'Responsabilité pénale'], definition: 'Mort causée sans intention de donner la mort, par maladresse, imprudence, inattention ou négligence grave.' },
  { terme: 'Instruction judiciaire', domaine: 'Pénal', loi: 'Art. 125 — Code de procédure pénale', related: ['Juge d\'instruction', 'Mise en examen'], definition: 'Phase d\'enquête menée par le juge d\'instruction visant à rassembler les preuves, entendre les témoins et décider des suites à donner à l\'affaire.' },
  { terme: 'Juge d\'instruction', domaine: 'Pénal', loi: 'Art. 125 — Code de procédure pénale', related: ['Instruction judiciaire', 'Mise en examen'], definition: 'Magistrat du siège chargé de conduire l\'information judiciaire en matière pénale : il instruit à charge et à décharge.' },
  { terme: 'Légitime défense',   domaine: 'Pénal', loi: 'Art. 47 — Code pénal', related: ['État de nécessité', 'Responsabilité pénale'], definition: 'Fait justificatif qui exonère de responsabilité pénale la personne qui, face à une agression injuste et actuelle, accomplit un acte de défense nécessaire et proportionné.' },
  { terme: 'Mise en examen',     domaine: 'Pénal', loi: 'Art. 176 — Code de procédure pénale', related: ['Instruction judiciaire', 'Garde à vue'], definition: 'Acte par lequel le juge d\'instruction signifie à une personne qu\'elle est soupçonnée d\'avoir commis une infraction et lui notifie ses droits.' },
  { terme: 'Prescription pénale', domaine: 'Pénal', loi: 'Art. 8 — Code de procédure pénale', related: ['Prescription civile', 'Action publique'], definition: 'Délai au-delà duquel l\'action publique s\'éteint et les poursuites pénales ne peuvent plus être exercées contre l\'auteur d\'une infraction.' },
  { terme: 'Récidive',           domaine: 'Pénal', loi: 'Art. 56 — Code pénal', related: ['Circonstances aggravantes', 'Peine'], definition: 'Situation d\'une personne qui commet une nouvelle infraction après avoir déjà été définitivement condamnée, entraînant un alourdissement de la peine.', exemple: 'En état de récidive, la peine maximale peut être doublée selon le Code pénal.' },
  { terme: 'Réclusion criminelle', domaine: 'Pénal', loi: 'Art. 15 — Code pénal', related: ['Crime', 'Peine'], definition: 'Peine privative de liberté la plus sévère applicable aux crimes de droit commun, pouvant aller jusqu\'à la perpétuité.' },
  { terme: 'Responsabilité pénale', domaine: 'Pénal', loi: 'Art. 24 — Code pénal', related: ['Complicité', 'Légitime défense'], definition: 'Obligation de répondre d\'une infraction pénale et d\'en subir les sanctions. Elle suppose un acte intentionnel ou par négligence grave.' },
  { terme: 'État de nécessité',  domaine: 'Pénal', loi: 'Art. 48 — Code pénal', related: ['Légitime défense', 'Responsabilité pénale'], definition: 'Fait justificatif permettant d\'échapper à la responsabilité pénale lorsqu\'une personne commet une infraction pour éviter un danger grave et imminent.' },

  // ── Civil & Obligations ────────────────────────────────────────────────────
  { terme: 'Action en nullité',  domaine: 'Civil', loi: 'Art. 181 — Code civil', related: ['Nullité', 'Prescription civile'], definition: 'Demande en justice tendant à faire déclarer un acte juridique nul et sans effet, pour vice de forme ou de fond.' },
  { terme: 'Astreinte',          domaine: 'Civil', loi: 'Art. 1266 — Code civil', related: ['Décision de justice', 'Injonction'], definition: 'Condamnation pécuniaire accessoire, fixée par le juge, destinée à contraindre un débiteur à exécuter une obligation, par un montant par jour de retard.' },
  { terme: 'Clause pénale',      domaine: 'Contrats', loi: 'Art. 1228 — Code civil', related: ['Dommages-intérêts', 'Obligation contractuelle'], definition: 'Stipulation contractuelle fixant à l\'avance le montant des dommages-intérêts en cas d\'inexécution ou de retard.' },
  { terme: 'Dol',                domaine: 'Contrats', loi: 'Art. 1137 — Code civil', related: ['Nullité', 'Vice du consentement'], definition: 'Manœuvre frauduleuse commise par une partie pour déterminer l\'autre à contracter, constituant un vice du consentement permettant d\'obtenir la nullité du contrat.' },
  { terme: 'Dommages-intérêts',  domaine: 'Contrats', loi: 'Art. 1231 — Code civil', related: ['Responsabilité civile', 'Préjudice'], definition: 'Somme d\'argent allouée par le juge à la victime d\'un préjudice pour réparer le dommage subi, matériel ou moral.', exemple: 'Le tribunal a alloué 5 000 000 FG de dommages-intérêts pour le préjudice subi.' },
  { terme: 'Force majeure',      domaine: 'Contrats', loi: 'Art. 1218 — Code civil', related: ['Obligation contractuelle', 'Responsabilité civile'], definition: 'Événement imprévisible, irrésistible et extérieur aux parties qui exonère le débiteur de sa responsabilité pour inexécution contractuelle.' },
  { terme: 'Injonction',         domaine: 'Civil', related: ['Astreinte', 'Référé'], definition: 'Ordre donné par un juge à une personne d\'accomplir ou de s\'abstenir d\'accomplir un acte précis, sous peine d\'astreinte.' },
  { terme: 'Nullité',            domaine: 'Contrats', loi: 'Art. 180 — Code civil', related: ['Vice du consentement', 'Dol'], definition: 'Sanction civile qui prive un acte juridique de ses effets en raison d\'un vice affectant sa formation (capacité, consentement, objet, cause).' },
  { terme: 'Obligation contractuelle', domaine: 'Contrats', loi: 'Art. 1193 — Code civil', related: ['Force majeure', 'Clause pénale'], definition: 'Lien de droit par lequel le débiteur est tenu d\'accomplir une prestation envers le créancier, sous peine de réparation du préjudice causé.' },
  { terme: 'Prescription civile', domaine: 'Civil', loi: 'Art. 2224 — Code civil', related: ['Prescription pénale', 'Action en justice'], definition: 'Mode d\'extinction d\'une action en justice résultant de l\'écoulement d\'un délai sans que le titulaire du droit ait agi en justice.' },
  { terme: 'Référé',             domaine: 'Civil', loi: 'Art. 849 — Code de procédure civile', related: ['Injonction', 'Action en justice'], definition: 'Procédure d\'urgence permettant d\'obtenir rapidement du juge une mesure provisoire sans attendre un jugement au fond.', exemple: 'En référé, le juge a ordonné la suspension immédiate des travaux litigieux.' },
  { terme: 'Responsabilité civile', domaine: 'Contrats', loi: 'Art. 1240 — Code civil', related: ['Dommages-intérêts', 'Préjudice'], definition: 'Obligation de réparer le dommage causé à autrui par son fait personnel, par le fait des personnes dont on répond, ou par le fait des choses.' },
  { terme: 'Solidarité',         domaine: 'Contrats', loi: 'Art. 1313 — Code civil', related: ['Obligation contractuelle', 'Caution'], definition: 'Lien unissant plusieurs débiteurs en vertu duquel chaque débiteur peut être tenu de la totalité de la dette par le créancier.' },
  { terme: 'Vice du consentement', domaine: 'Contrats', loi: 'Art. 1130 — Code civil', related: ['Dol', 'Nullité'], definition: 'Altération de la volonté d\'une partie lors de la conclusion d\'un contrat (erreur, dol ou violence) permettant d\'obtenir la nullité.' },

  // ── Famille ────────────────────────────────────────────────────────────────
  { terme: 'Adoption',           domaine: 'Famille', loi: 'Art. 353 — Code de l\'enfant', related: ['Filiation', 'Tutelle'], definition: 'Acte juridique par lequel un individu ou un couple devient légalement parent d\'un enfant qui n\'est pas biologiquement le leur.' },
  { terme: 'Autorité parentale', domaine: 'Famille', loi: 'Art. 371 — Code civil', related: ['Tutelle', 'Filiation'], definition: 'Ensemble des droits et obligations que la loi attribue aux père et mère pour protéger et élever leurs enfants mineurs.' },
  { terme: 'Divorce',            domaine: 'Famille', loi: 'Art. 229 — Code civil', related: ['Pension alimentaire', 'Régime matrimonial'], definition: 'Dissolution du mariage du vivant des époux, prononcée par décision de justice, mettant fin au lien conjugal et à ses effets.', exemple: 'Le divorce peut être prononcé pour faute, par consentement mutuel ou pour altération définitive du lien conjugal.' },
  { terme: 'Filiation',          domaine: 'Famille', loi: 'Art. 310 — Code civil', related: ['Adoption', 'Autorité parentale'], definition: 'Lien juridique unissant un enfant à ses parents, établi par la loi, la reconnaissance ou l\'adoption, emportant droits et obligations réciproques.' },
  { terme: 'Garde d\'enfant',    domaine: 'Famille', loi: 'Art. 373 — Code civil', related: ['Autorité parentale', 'Pension alimentaire'], definition: 'Attribution par décision judiciaire à l\'un des parents ou aux deux en résidence alternée du soin quotidien de l\'enfant après séparation.' },
  { terme: 'Pension alimentaire', domaine: 'Famille', loi: 'Art. 205 — Code civil', related: ['Divorce', 'Garde d\'enfant'], definition: 'Somme versée périodiquement pour subvenir aux besoins essentiels d\'une personne, notamment d\'un enfant après séparation des parents.', exemple: 'Le tribunal a fixé une pension alimentaire de 500 000 FG par mois pour l\'entretien des deux enfants mineurs.' },
  { terme: 'Régime matrimonial', domaine: 'Famille', loi: 'Art. 1387 — Code civil', related: ['Divorce', 'Succession'], definition: 'Ensemble de règles juridiques organisant les rapports pécuniaires entre époux et avec les tiers, pouvant être légal ou conventionnel.' },
  { terme: 'Succession',         domaine: 'Famille', loi: 'Art. 720 — Code civil', related: ['Testament', 'Régime matrimonial'], definition: 'Transmission du patrimoine d\'une personne décédée à ses héritiers, selon les règles légales ou les dispositions testamentaires.' },
  { terme: 'Testament',          domaine: 'Famille', loi: 'Art. 895 — Code civil', related: ['Succession', 'Legs'], definition: 'Acte juridique unilatéral par lequel une personne exprime ses dernières volontés quant à la disposition de ses biens après son décès.' },
  { terme: 'Tutelle',            domaine: 'Famille', loi: 'Art. 390 — Code civil', related: ['Autorité parentale', 'Curatelle'], definition: 'Institution de protection juridique placée sous contrôle judiciaire, au profit d\'un mineur privé de ses parents ou d\'un majeur incapable.' },

  // ── Travail ────────────────────────────────────────────────────────────────
  { terme: 'CDI',                domaine: 'Travail', loi: 'Art. 6 — Code du travail', related: ['CDD', 'Licenciement'], definition: 'Contrat à Durée Indéterminée. Forme normale du contrat de travail, sans terme fixé, qui ne peut être rompu que dans les conditions légales.' },
  { terme: 'CDD',                domaine: 'Travail', loi: 'Art. 15 — Code du travail', related: ['CDI', 'Licenciement'], definition: 'Contrat à Durée Déterminée. Contrat de travail dont la durée est limitée, autorisé uniquement pour des tâches précises et temporaires.' },
  { terme: 'Convention collective', domaine: 'Travail', loi: 'Art. 188 — Code du travail', related: ['Syndicat', 'Licenciement'], definition: 'Accord écrit conclu entre syndicats d\'employeurs et de salariés, fixant les conditions d\'emploi et de travail dans un secteur.' },
  { terme: 'Délégué du personnel', domaine: 'Travail', loi: 'Art. 286 — Code du travail', related: ['Syndicat', 'Convention collective'], definition: 'Représentant élu par les salariés d\'une entreprise pour défendre leurs intérêts individuels et collectifs auprès de l\'employeur.' },
  { terme: 'Faute grave',        domaine: 'Travail', loi: 'Art. 85 — Code du travail', related: ['Licenciement', 'Faute lourde'], definition: 'Manquement du salarié à ses obligations rendant impossible la poursuite du contrat, justifiant un licenciement sans préavis ni indemnité.', exemple: 'L\'abandon de poste injustifié peut constituer une faute grave justifiant le licenciement immédiat.' },
  { terme: 'Faute lourde',       domaine: 'Travail', loi: 'Art. 85 — Code du travail', related: ['Faute grave', 'Licenciement'], definition: 'Faute intentionnelle du salarié, commise avec l\'intention de nuire à l\'employeur, prive de toutes indemnités et peut engager la responsabilité civile.' },
  { terme: 'Grève',              domaine: 'Travail', loi: 'Art. 258 — Code du travail', related: ['Syndicat', 'Convention collective'], definition: 'Cessation collective et concertée du travail pour appuyer des revendications professionnelles. Droit fondamental garanti par la Constitution guinéenne.' },
  { terme: 'Inspection du travail', domaine: 'Travail', loi: 'Art. 302 — Code du travail', related: ['SMIG', 'Convention collective'], definition: 'Service administratif chargé de veiller à l\'application de la législation du travail dans les entreprises, et de concilier les conflits collectifs.' },
  { terme: 'Licenciement',       domaine: 'Travail', loi: 'Art. 74 — Code du travail', related: ['Faute grave', 'Préavis', 'Indemnité de licenciement'], definition: 'Rupture du contrat de travail à l\'initiative de l\'employeur, qui doit reposer sur une cause réelle et sérieuse et respecter une procédure légale.', exemple: 'Tout licenciement sans cause réelle et sérieuse ouvre droit à des indemnités au profit du salarié.' },
  { terme: 'Indemnité de licenciement', domaine: 'Travail', loi: 'Art. 96 — Code du travail', related: ['Licenciement', 'Préavis'], definition: 'Somme versée par l\'employeur au salarié licencié, calculée en fonction de son ancienneté et de sa rémunération, hors faute grave.' },
  { terme: 'Préavis',            domaine: 'Travail', loi: 'Art. 79 — Code du travail', related: ['Licenciement', 'CDI'], definition: 'Délai légal ou conventionnel que doit respecter la partie qui rompt le contrat de travail avant que la rupture ne prenne effet.' },
  { terme: 'SMIG',               domaine: 'Travail', loi: 'Art. 213 — Code du travail', related: ['Salaire', 'Convention collective'], definition: 'Salaire Minimum Interprofessionnel Garanti. Rémunération minimale légale en dessous de laquelle aucun salarié ne peut être payé en Guinée.' },
  { terme: 'Syndicat',           domaine: 'Travail', loi: 'Art. 226 — Code du travail', related: ['Convention collective', 'Grève'], definition: 'Association de travailleurs ou d\'employeurs constituée pour défendre leurs intérêts professionnels, économiques et sociaux communs.' },

  // ── Foncier ────────────────────────────────────────────────────────────────
  { terme: 'Bail',               domaine: 'Foncier', loi: 'Art. 1709 — Code civil', related: ['Loyer', 'Expulsion'], definition: 'Contrat par lequel le propriétaire (bailleur) cède la jouissance d\'un bien à une autre personne (locataire) pour une durée déterminée moyennant loyer.', exemple: 'Le bail commercial doit être conclu par écrit pour être opposable aux tiers.' },
  { terme: 'Expropriation',      domaine: 'Foncier', loi: 'Art. 44 — Code foncier et domanial', related: ['Immatriculation foncière', 'Domaine public'], definition: 'Procédure par laquelle l\'autorité publique contraint un propriétaire à lui céder son bien immobilier, moyennant une juste et préalable indemnité.' },
  { terme: 'Expulsion',          domaine: 'Foncier', loi: 'Art. 226 — Code de procédure civile', related: ['Bail', 'Huissier de justice'], definition: 'Procédure judiciaire par laquelle le propriétaire ou le bailleur obtient l\'éviction forcée d\'un occupant sans droit ni titre.' },
  { terme: 'Hypothèque',         domaine: 'Foncier', loi: 'Art. 2393 — Code civil', related: ['Immatriculation foncière', 'Saisie immobilière'], definition: 'Sûreté réelle immobilière conférée sans dépossession du débiteur, permettant au créancier de faire saisir l\'immeuble s\'il n\'est pas payé.' },
  { terme: 'Immatriculation foncière', domaine: 'Foncier', loi: 'Art. 1 — Code foncier et domanial', related: ['Titre foncier', 'Expropriation'], definition: 'Procédure qui consacre la propriété foncière en Guinée. L\'inscription sur le livre foncier confère un titre inattaquable et définitif.', exemple: 'L\'immatriculation foncière est la seule preuve incontestable du droit de propriété sur un terrain en Guinée.' },
  { terme: 'Loyer',              domaine: 'Foncier', loi: 'Art. 1728 — Code civil', related: ['Bail', 'Expulsion'], definition: 'Somme d\'argent payée périodiquement par le locataire au propriétaire en contrepartie de la jouissance du bien loué.' },
  { terme: 'Servitude',          domaine: 'Foncier', loi: 'Art. 637 — Code civil', related: ['Propriété foncière', 'Usufruit'], definition: 'Charge imposée sur un immeuble (fonds servant) au profit d\'un autre immeuble (fonds dominant) appartenant à un propriétaire différent.' },
  { terme: 'Titre foncier',      domaine: 'Foncier', loi: 'Art. 68 — Code foncier et domanial', related: ['Immatriculation foncière', 'Propriété foncière'], definition: 'Document officiel délivré par l\'administration foncière guinéenne attestant de manière définitive et inattaquable le droit de propriété sur un terrain.' },
  { terme: 'Usufruit',           domaine: 'Foncier', loi: 'Art. 578 — Code civil', related: ['Servitude', 'Propriété foncière'], definition: 'Droit réel de jouir des choses dont un autre a la propriété (nu-propriété), à charge d\'en conserver la substance.' },

  // ── Commercial & Sociétés ──────────────────────────────────────────────────
  { terme: 'Arbitrage',          domaine: 'Commercial', loi: 'Art. 1442 — Code de procédure civile', related: ['Clause compromissoire', 'Médiation'], definition: 'Mode alternatif de règlement des litiges par lequel les parties confient à un ou plusieurs arbitres le soin de trancher leur différend.' },
  { terme: 'Caution',            domaine: 'Commercial', loi: 'Art. 2288 — Code civil', related: ['Solidarité', 'Hypothèque'], definition: 'Contrat par lequel une personne (caution) s\'engage envers un créancier à payer la dette d\'un débiteur si celui-ci défaille.' },
  { terme: 'Clause compromissoire', domaine: 'Commercial', related: ['Arbitrage', 'Contrat commercial'], definition: 'Stipulation insérée dans un contrat par laquelle les parties conviennent à l\'avance de soumettre tout litige né de ce contrat à un arbitrage.' },
  { terme: 'Cession de parts',   domaine: 'Commercial', loi: 'Art. 317 — Code des activités économiques', related: ['SARL', 'SA'], definition: 'Opération par laquelle un associé transfère ses droits sociaux dans une société à un cessionnaire, selon les conditions prévues par les statuts.' },
  { terme: 'Faillite',           domaine: 'Commercial', loi: 'Art. 864 — Code des activités économiques', related: ['Liquidation judiciaire', 'Redressement judiciaire'], definition: 'Situation juridique d\'un commerçant ou d\'une société qui ne peut plus faire face à ses dettes exigibles avec son actif disponible.', exemple: 'Dès la cessation des paiements constatée, le tribunal peut ouvrir une procédure collective.' },
  { terme: 'Liquidation judiciaire', domaine: 'Commercial', loi: 'Art. 920 — Code des activités économiques', related: ['Faillite', 'Redressement judiciaire'], definition: 'Procédure collective qui met fin à l\'activité d\'une entreprise en cessation des paiements dont le redressement est manifestement impossible.' },
  { terme: 'Médiation',          domaine: 'Commercial', related: ['Arbitrage', 'Conciliation'], definition: 'Mode amiable de règlement des conflits dans lequel un tiers neutre (médiateur) facilite la négociation entre les parties pour aboutir à un accord.' },
  { terme: 'Redressement judiciaire', domaine: 'Commercial', loi: 'Art. 895 — Code des activités économiques', related: ['Faillite', 'Liquidation judiciaire'], definition: 'Procédure collective ouverte à une entreprise en difficulté pour permettre la poursuite de l\'activité, l\'emploi et l\'apurement du passif.' },
  { terme: 'SA',                 domaine: 'Commercial', loi: 'Art. 385 — Code des activités économiques', related: ['SARL', 'Cession de parts'], definition: 'Société Anonyme. Société de capitaux dont le capital est divisé en actions librement cessibles, administrée par un conseil d\'administration.' },
  { terme: 'SARL',               domaine: 'Commercial', loi: 'Art. 309 — Code des activités économiques', related: ['SA', 'Cession de parts'], definition: 'Société à Responsabilité Limitée. Société dans laquelle la responsabilité des associés est limitée au montant de leurs apports.', exemple: 'La SARL est la forme juridique la plus répandue pour les PME en Guinée.' },

  // ── Fiscal & Finance ───────────────────────────────────────────────────────
  { terme: 'Contentieux fiscal',  domaine: 'Fiscal', loi: 'Art. 625 — Code général des impôts', related: ['Redressement fiscal', 'TVA'], definition: 'Ensemble des procédures par lesquelles un contribuable conteste une décision de l\'administration fiscale devant la juridiction compétente.' },
  { terme: 'Redressement fiscal', domaine: 'Fiscal', loi: 'Art. 580 — Code général des impôts', related: ['Contentieux fiscal', 'TVA'], definition: 'Procédure par laquelle l\'administration fiscale réclame à un contribuable un complément d\'impôt suite à une vérification de sa comptabilité.' },
  { terme: 'TVA',                 domaine: 'Fiscal', loi: 'Art. 305 — Code général des impôts', related: ['Redressement fiscal', 'Contentieux fiscal'], definition: 'Taxe sur la Valeur Ajoutée. Impôt indirect sur la consommation, collecté par les entreprises pour le compte de l\'État guinéen.', exemple: 'Le taux normal de TVA est de 18% en Guinée selon le Code général des impôts.' },

  // ── Minier ────────────────────────────────────────────────────────────────
  { terme: 'Permis de recherche', domaine: 'Minier', loi: 'Art. 30 — Code minier', related: ['Concession minière', 'Titre minier'], definition: 'Titre minier accordé pour une durée déterminée, autorisant son titulaire à effectuer des travaux de reconnaissance géologique sur un périmètre délimité.' },
  { terme: 'Concession minière',  domaine: 'Minier', loi: 'Art. 55 — Code minier', related: ['Permis de recherche', 'Royalties'], definition: 'Titre minier permettant l\'exploitation industrielle d\'un gisement sur une superficie et pour une durée définies, avec des obligations environnementales et fiscales.' },
  { terme: 'Royalties',           domaine: 'Minier', loi: 'Art. 171 — Code minier', related: ['Concession minière', 'Contrat minier'], definition: 'Redevances minières versées à l\'État par l\'exploitant, calculées en pourcentage de la valeur des minerais extraits (bauxite, or, fer, diamants).' },

  // ── Constitutionnel ────────────────────────────────────────────────────────
  { terme: 'État de droit',       domaine: 'Constitutionnel', loi: 'Art. 1 — Constitution 2025', related: ['Séparation des pouvoirs', 'Droits fondamentaux'], definition: 'Système politique dans lequel l\'ensemble des pouvoirs publics et des citoyens est soumis au respect du droit et où les libertés fondamentales sont garanties.' },
  { terme: 'Droits fondamentaux', domaine: 'Constitutionnel', loi: 'Art. 6 — Constitution 2025', related: ['État de droit', 'Liberté publique'], definition: 'Droits inhérents à la personne humaine, reconnus et garantis par la Constitution et les conventions internationales ratifiées par la Guinée.' },
  { terme: 'Liberté publique',    domaine: 'Constitutionnel', loi: 'Art. 8 — Constitution 2025', related: ['Droits fondamentaux', 'État de droit'], definition: 'Droit ou liberté reconnu à chaque citoyen dans ses rapports avec les pouvoirs publics et garanti par la Constitution guinéenne.' },
  { terme: 'Séparation des pouvoirs', domaine: 'Constitutionnel', loi: 'Art. 82 — Constitution 2025', related: ['État de droit', 'Pouvoir judiciaire'], definition: 'Principe fondamental qui distingue les fonctions législative (Assemblée nationale), exécutive (Gouvernement) et judiciaire (Cours et tribunaux).' },
  { terme: 'Pouvoir judiciaire',  domaine: 'Constitutionnel', loi: 'Art. 102 — Constitution 2025', related: ['Séparation des pouvoirs', 'Cour Suprême'], definition: 'L\'un des trois pouvoirs de l\'État, indépendant du législatif et de l\'exécutif, chargé de rendre la justice au nom du peuple de Guinée.' },
];

const DOMAINES = ['Tous', ...Array.from(new Set(TERMES.map(t => t.domaine))).sort()];
const LETTRES  = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const DOM_CONFIG: Record<string, { color: string; icon: string }> = {
  'Pénal':           { color: '#dc2626', icon: 'lock' },
  'Famille':         { color: '#7c3aed', icon: 'users' },
  'Civil':           { color: '#FF8A00', icon: 'users' },
  'Travail':         { color: '#059669', icon: 'factory' },
  'Foncier':         { color: '#d97706', icon: 'home' },
  'Commercial':      { color: '#FF5A00', icon: 'briefcase' },
  'Procédure':       { color: '#64748b', icon: 'clipboard' },
  'Contrats':        { color: '#FF8A00', icon: 'pen' },
  'Constitutionnel': { color: '#be185d', icon: 'scale' },
  'Fiscal':          { color: '#065f46', icon: 'coins' },
  'Minier':          { color: '#92400e', icon: 'pickaxe' },
};

const THINKING_STEPS = [
  'Lecture de la question…',
  'Consultation des textes de loi guinéens…',
  'Analyse juridique en cours…',
  'Rédaction de l\'explication…',
  'Finalisation…',
];

@Component({
  selector:    'app-glossaire',
  imports:     [CommonModule, FormsModule, NgTemplateOutlet, SlicePipe, UiIcon],
  templateUrl: './glossary.html',
  styleUrl:    './glossary.scss',
})
export class Glossary implements OnDestroy {
  private router = inject(Router);
  private svc    = inject(EncyclopediaService);

  readonly TERMES    = TERMES;
  readonly DOMAINES  = DOMAINES;
  readonly LETTRES   = LETTRES;
  readonly DOM_CONFIG = DOM_CONFIG;

  // ── État UI ───────────────────────────────────────────────────────────────
  search         = signal('');
  selectedDomain = signal('Tous');
  selectedLetter = signal('');
  expandedTerm   = signal<string | null>(null);
  viewMode       = signal<ViewMode>('alpha');

  // ── Q&A inline ────────────────────────────────────────────────────────────
  askingTerm   = signal<string | null>(null);
  askResult    = signal<AskCodeResponse | null>(null);
  askStage     = signal<AskStage>('idle');
  askError     = signal<string>('');
  thinkingStep = signal<number>(0);
  thinkingMessages = THINKING_STEPS;
  private _timer?: ReturnType<typeof setInterval>;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredTermes = computed(() => {
    const q = this.search().toLowerCase().trim();
    const d = this.selectedDomain();
    const l = this.selectedLetter();
    return TERMES.filter(t => {
      if (d !== 'Tous' && t.domaine !== d) return false;
      if (l && !t.terme.toUpperCase().startsWith(l)) return false;
      if (q && !t.terme.toLowerCase().includes(q)
            && !t.definition.toLowerCase().includes(q)
            && !(t.exemple ?? '').toLowerCase().includes(q)) return false;
      return true;
    }).sort((a, b) => a.terme.localeCompare(b.terme, 'fr'));
  });

  readonly availableLetters = computed(() =>
    new Set(TERMES
      .filter(t => this.selectedDomain() === 'Tous' || t.domaine === this.selectedDomain())
      .map(t => t.terme[0].toUpperCase()))
  );

  readonly termsByLetter = computed(() => {
    const map = new Map<string, GlossaryTerm[]>();
    this.filteredTermes().forEach(t => {
      const l = t.terme[0].toUpperCase();
      if (!map.has(l)) map.set(l, []);
      map.get(l)!.push(t);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  });

  readonly termsByDomain = computed(() => {
    const map = new Map<string, GlossaryTerm[]>();
    this.filteredTermes().forEach(t => {
      if (!map.has(t.domaine)) map.set(t.domaine, []);
      map.get(t.domaine)!.push(t);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  });

  readonly statsPerDomain = computed(() => {
    const map = new Map<string, number>();
    TERMES.forEach(t => map.set(t.domaine, (map.get(t.domaine) ?? 0) + 1));
    return Array.from(map.entries())
      .map(([d, n]) => ({ domaine: d, count: n, ...DOM_CONFIG[d] }))
      .sort((a, b) => b.count - a.count);
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnDestroy() { this._stopThinking(); }

  // ── Filtres ───────────────────────────────────────────────────────────────
  selectLetter(l: string) {
    this.selectedLetter.set(this.selectedLetter() === l ? '' : l);
    this.search.set('');
    this.expandedTerm.set(null);
  }

  selectDomain(d: string) {
    this.selectedDomain.set(d);
    this.selectedLetter.set('');
    this.expandedTerm.set(null);
  }

  resetFilters() {
    this.search.set('');
    this.selectedDomain.set('Tous');
    this.selectedLetter.set('');
    this.expandedTerm.set(null);
  }

  // ── Expand / collapse ─────────────────────────────────────────────────────
  toggle(terme: string) {
    if (this.expandedTerm() === terme) {
      this.expandedTerm.set(null);
      this.closeAsk();
    } else {
      this.expandedTerm.set(terme);
      this.closeAsk();
    }
  }

  // ── Q&A inline ────────────────────────────────────────────────────────────
  openAsk(terme: string) {
    if (this.askingTerm() === terme) { this.closeAsk(); return; }
    this.askingTerm.set(terme);
    this.askResult.set(null);
    this.askStage.set('loading');
    this.askError.set('');
    this._startThinking();

    const question = `Explique en détail le terme juridique "${terme}" selon le droit guinéen. Donne la définition précise, l'origine légale, un exemple pratique, et les textes de loi guinéens applicables.`;

    this.svc.askCode(question, '').subscribe({
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
    this.askingTerm.set(null);
    this.askResult.set(null);
    this.askStage.set('idle');
    this.askError.set('');
    this._stopThinking();
  }

  goToChat(terme: string) {
    const q = `Explique-moi le concept juridique de "${terme}" selon le droit guinéen, avec les articles de loi applicables et des exemples pratiques.`;
    this.router.navigate(['/dashboard/chat'], { queryParams: { q } });
  }

  clickRelated(rel: string) {
    const found = TERMES.find(t => t.terme === rel);
    if (found) {
      this.selectedDomain.set('Tous');
      this.search.set(rel);
      this.selectedLetter.set('');
      this.expandedTerm.set(rel);
      this.closeAsk();
      setTimeout(() => {
        document.getElementById(`term-${rel.replace(/\s/g, '-')}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  domainColor(d: string): string { return DOM_CONFIG[d]?.color ?? '#64748b'; }
  domainIcon(d: string): string  { return DOM_CONFIG[d]?.icon  ?? 'file'; }

  isSearching = computed(() => this.search().trim().length > 0);

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

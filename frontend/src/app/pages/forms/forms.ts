import {
  Component, signal, computed, inject, OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { EncyclopediaService, AskCodeResponse } from '../../services/encyclopedia.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

// ── Types ─────────────────────────────────────────────────────────────────────
type ViewMode   = 'library' | 'fill';
type HelpStage  = 'idle' | 'loading' | 'done' | 'error';
type PolishStage = 'idle' | 'loading' | 'done' | 'error';

export interface FormField {
  key:          string;
  label:        string;
  type:         'text' | 'textarea' | 'date' | 'number' | 'select';
  placeholder:  string;
  required:     boolean;
  options?:     string[];
  hint?:        string;
  section?:     string;
}

export interface LegalForm {
  id:           string;
  titre:        string;
  sous_titre:   string;
  categorie:    string;
  icon:         string;
  description:  string;
  duree_fill:   string;
  difficulte:   'Facile' | 'Moyen' | 'Complexe';
  base_legale:  string;
  tags:         string[];
  fields:       FormField[];
  template:     string;
}

// ── Catalogue ─────────────────────────────────────────────────────────────────
const FORMS: LegalForm[] = [
  // ──────────────────────────────────────────────────────────────────────────
  // 1. CONTRAT DE BAIL RÉSIDENTIEL
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'bail-residentiel', categorie: 'Foncier', icon: 'home',
    titre: 'Contrat de bail résidentiel',
    sous_titre: 'Location de logement entre particuliers',
    description: 'Contrat de location d\'un bien immobilier à usage d\'habitation conforme au droit guinéen.',
    duree_fill: '8-12 min', difficulte: 'Moyen',
    base_legale: 'Code civil guinéen, Code foncier et domanial',
    tags: ['location', 'logement', 'loyer', 'bail'],
    fields: [
      { key: 'bailleur_nom',      label: 'Nom complet du bailleur',        type: 'text',   placeholder: 'Ex : Mamadou DIALLO',          required: true,  section: 'Bailleur', hint: 'Nom et prénom(s) tels qu\'ils figurent sur la CNI du propriétaire.' },
      { key: 'bailleur_cni',      label: 'N° CNI du bailleur',             type: 'text',   placeholder: 'Ex : GN-123456',               required: true,  section: 'Bailleur' },
      { key: 'bailleur_adresse',  label: 'Adresse du bailleur',            type: 'text',   placeholder: 'Ex : Quartier Ratoma, Conakry', required: true,  section: 'Bailleur' },
      { key: 'locataire_nom',     label: 'Nom complet du locataire',       type: 'text',   placeholder: 'Ex : Aïssatou BARRY',          required: true,  section: 'Locataire', hint: 'Nom et prénom(s) tels qu\'ils figurent sur la CNI du locataire.' },
      { key: 'locataire_cni',     label: 'N° CNI du locataire',            type: 'text',   placeholder: 'Ex : GN-789012',               required: true,  section: 'Locataire' },
      { key: 'locataire_adresse', label: 'Adresse actuelle du locataire',  type: 'text',   placeholder: 'Ex : Commune de Dixinn',       required: false, section: 'Locataire' },
      { key: 'bien_adresse',      label: 'Adresse du bien loué',           type: 'text',   placeholder: 'Ex : Maison n°15, Cité Rouge, Matoto', required: true, section: 'Bien loué' },
      { key: 'bien_description',  label: 'Description du bien',            type: 'text',   placeholder: 'Ex : Villa de 4 pièces avec jardin', required: true, section: 'Bien loué', hint: 'Précisez le type (villa, appartement, chambre), le nombre de pièces.' },
      { key: 'date_debut',        label: 'Date de début du bail',          type: 'date',   placeholder: '',                              required: true,  section: 'Conditions' },
      { key: 'duree_bail',        label: 'Durée du bail',                  type: 'select', placeholder: '',                             required: true,  section: 'Conditions', options: ['1 an renouvelable', '2 ans', '3 ans', '5 ans', 'Durée indéterminée'] },
      { key: 'loyer_mensuel',     label: 'Loyer mensuel (en FG)',          type: 'number', placeholder: 'Ex : 2000000',                 required: true,  section: 'Conditions', hint: 'Le loyer doit être fixé librement entre les parties.' },
      { key: 'caution',           label: 'Montant de la caution (en FG)',  type: 'number', placeholder: 'Ex : 4000000',                 required: false, section: 'Conditions', hint: 'Généralement équivalent à 1 ou 2 mois de loyer.' },
      { key: 'jour_paiement',     label: 'Jour de paiement du loyer',      type: 'select', placeholder: '',                             required: true,  section: 'Conditions', options: ['1er du mois', '5 du mois', '10 du mois', '15 du mois'] },
      { key: 'ville',             label: 'Ville de signature',             type: 'text',   placeholder: 'Ex : Conakry',                 required: true,  section: 'Signature' },
      { key: 'date_signature',    label: 'Date de signature',              type: 'date',   placeholder: '',                             required: true,  section: 'Signature' },
    ],
    template: `CONTRAT DE BAIL RÉSIDENTIEL

Entre les soussignés :

LE BAILLEUR
Nom et prénom(s) : {{bailleur_nom}}
N° de carte nationale d'identité : {{bailleur_cni}}
Demeurant à : {{bailleur_adresse}}
Ci-après dénommé(e) « le Bailleur »,

D'UNE PART,

ET

LE LOCATAIRE
Nom et prénom(s) : {{locataire_nom}}
N° de carte nationale d'identité : {{locataire_cni}}
Demeurant actuellement à : {{locataire_adresse}}
Ci-après dénommé(e) « le Locataire »,

D'AUTRE PART,

IL A ÉTÉ CONVENU CE QUI SUIT :

ARTICLE 1 — OBJET DU CONTRAT
Le Bailleur loue au Locataire, qui accepte, le bien immobilier suivant :
{{bien_description}}, situé à : {{bien_adresse}}

ARTICLE 2 — DURÉE
Le présent bail est consenti pour une durée de {{duree_bail}}, à compter du {{date_debut}}.
Il sera renouvelé par tacite reconduction sauf congé donné par l'une des parties avec un préavis de trois (3) mois.

ARTICLE 3 — LOYER
Le Locataire s'engage à payer un loyer mensuel de {{loyer_mensuel}} francs guinéens (FG), payable le {{jour_paiement}} de chaque mois.

ARTICLE 4 — CAUTION
À la signature des présentes, le Locataire versera au Bailleur une caution de {{caution}} FG, remboursable à la fin du bail déduction faite des éventuelles dégradations constatées.

ARTICLE 5 — OBLIGATIONS DU LOCATAIRE
Le Locataire s'engage à :
- Payer le loyer aux échéances convenues ;
- Occuper les lieux en bon père de famille ;
- Ne pas sous-louer sans accord écrit préalable du Bailleur ;
- Restituer les lieux en bon état en fin de bail ;
- Ne pas effectuer de travaux de transformation sans accord préalable.

ARTICLE 6 — OBLIGATIONS DU BAILLEUR
Le Bailleur s'engage à :
- Délivrer le logement en bon état d'usage ;
- Assurer la jouissance paisible des lieux ;
- Effectuer les réparations importantes incombant au propriétaire.

ARTICLE 7 — RÉSILIATION
Le présent bail pourra être résilié par l'une des parties avec un préavis de trois (3) mois par lettre recommandée ou remise en main propre avec accusé de réception.

ARTICLE 8 — ÉLECTION DE DOMICILE
Pour l'exécution des présentes, les parties font élection de domicile à leur adresse respective indiquée ci-dessus.
Tout litige relatif à l'interprétation ou à l'exécution du présent contrat sera soumis aux juridictions compétentes de Guinée.

Fait à {{ville}}, le {{date_signature}},
En deux (2) exemplaires originaux, chacun reconnaissant avoir reçu le sien.

LE BAILLEUR                           LE LOCATAIRE
(Signature et nom)                     (Signature et nom)

______________________                 ______________________
{{bailleur_nom}}                       {{locataire_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 2. MISE EN DEMEURE
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'mise-en-demeure', categorie: 'Civil', icon: 'alert-triangle',
    titre: 'Mise en demeure',
    sous_titre: 'Lettre de mise en demeure officielle',
    description: 'Acte par lequel vous sommez officiellement une personne ou société de s\'exécuter, préalable indispensable à toute action en justice.',
    duree_fill: '5-8 min', difficulte: 'Facile',
    base_legale: 'Code civil guinéen, Art. 1139',
    tags: ['mise en demeure', 'recouvrement', 'inexécution', 'contentieux'],
    fields: [
      { key: 'expediteur_nom',     label: 'Votre nom complet',           type: 'text',     placeholder: 'Ex : Alpha CAMARA',            required: true,  section: 'Expéditeur' },
      { key: 'expediteur_adresse', label: 'Votre adresse',               type: 'text',     placeholder: 'Ex : Kaloum, Conakry',         required: true,  section: 'Expéditeur' },
      { key: 'expediteur_tel',     label: 'Votre téléphone',             type: 'text',     placeholder: 'Ex : +224 622 123 456',        required: false, section: 'Expéditeur' },
      { key: 'destinataire_nom',   label: 'Nom du destinataire',         type: 'text',     placeholder: 'Ex : Ibrahim KOUYATÉ',         required: true,  section: 'Destinataire' },
      { key: 'destinataire_qual',  label: 'Qualité du destinataire',     type: 'text',     placeholder: 'Ex : Gérant de la société XY', required: false, section: 'Destinataire', hint: 'Précisez s\'il s\'agit d\'un particulier, d\'un commerçant, d\'une société.' },
      { key: 'destinataire_adresse', label: 'Adresse du destinataire',   type: 'text',     placeholder: 'Ex : Commune de Matam, Conakry', required: true, section: 'Destinataire' },
      { key: 'objet',              label: 'Objet du litige',             type: 'select',   placeholder: '',                              required: true,  section: 'Litige', options: ['Paiement d\'une dette', 'Exécution d\'un contrat', 'Restitution d\'un bien', 'Remboursement d\'un prêt', 'Paiement de loyers impayés', 'Réparation de dommages', 'Autre'] },
      { key: 'montant',            label: 'Montant réclamé (FG)',        type: 'number',   placeholder: 'Ex : 5000000',                  required: false, section: 'Litige', hint: 'Laissez vide si la réclamation n\'est pas monétaire.' },
      { key: 'faits',              label: 'Description des faits',       type: 'textarea', placeholder: 'Décrivez précisément les faits à l\'origine de cette mise en demeure…', required: true, section: 'Litige', hint: 'Soyez factuel et précis : dates, montants, engagements non respectés.' },
      { key: 'delai_jours',        label: 'Délai accordé (jours)',       type: 'select',   placeholder: '',                              required: true,  section: 'Exécution', options: ['8 jours', '15 jours', '30 jours', '48 heures'] },
      { key: 'ville',              label: 'Ville',                       type: 'text',     placeholder: 'Ex : Conakry',                  required: true,  section: 'Signature' },
      { key: 'date_lettre',        label: 'Date de la lettre',           type: 'date',     placeholder: '',                              required: true,  section: 'Signature' },
    ],
    template: `MISE EN DEMEURE
(Lettre recommandée avec avis de réception)

{{ville}}, le {{date_lettre}}

{{expediteur_nom}}
{{expediteur_adresse}}
{{expediteur_tel}}

À
{{destinataire_nom}}{{destinataire_qual}}
{{destinataire_adresse}}

Objet : MISE EN DEMEURE — {{objet}}

Monsieur / Madame {{destinataire_nom}},

Par la présente, je vous mets solennellement en demeure, conformément aux dispositions du Code civil guinéen, de vous exécuter dans les meilleurs délais.

RAPPEL DES FAITS :
{{faits}}

RÉCLAMATION :
En conséquence des faits exposés ci-dessus, je vous somme formellement, dans un délai de {{delai_jours}} à compter de la réception de la présente lettre, de procéder à : {{objet}}{{montant}} pour un montant de {{montant}} francs guinéens (FG).

AVERTISSEMENT :
À défaut d'exécution dans le délai imparti, je me verrai contraint(e) de porter cette affaire devant les juridictions compétentes de la République de Guinée, et ce, à vos frais exclusifs.

Cette lettre vaut mise en demeure au sens de la loi. Elle constitue le point de départ des intérêts de retard éventuels.

Je vous prie d'agréer, Monsieur / Madame, l'expression de mes sentiments distingués.

______________________
{{expediteur_nom}}
(Signature)`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CONTRAT DE TRAVAIL CDI
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'contrat-travail-cdi', categorie: 'Travail', icon: 'briefcase',
    titre: 'Contrat de travail CDI',
    sous_titre: 'Contrat à durée indéterminée',
    description: 'Contrat de travail à durée indéterminée conforme au Code du travail guinéen de 2014.',
    duree_fill: '10-15 min', difficulte: 'Moyen',
    base_legale: 'Code du travail guinéen 2014, Art. 70-95',
    tags: ['emploi', 'CDI', 'recrutement', 'salaire'],
    fields: [
      { key: 'employeur_nom',     label: 'Raison sociale / Nom employeur',  type: 'text',   placeholder: 'Ex : Société KAMARA & Associés',  required: true,  section: 'Employeur' },
      { key: 'employeur_siege',   label: 'Siège social / Adresse',          type: 'text',   placeholder: 'Ex : Kaloum, Conakry',             required: true,  section: 'Employeur' },
      { key: 'employeur_rccm',    label: 'N° RCCM (si société)',            type: 'text',   placeholder: 'Ex : RCCM/GN-KAL/2022/A/1234',    required: false, section: 'Employeur' },
      { key: 'representant_nom',  label: 'Nom du représentant légal',       type: 'text',   placeholder: 'Ex : Mamadou KAMARA, DG',          required: true,  section: 'Employeur' },
      { key: 'employe_nom',       label: 'Nom complet de l\'employé(e)',    type: 'text',   placeholder: 'Ex : Fatoumata SOUMAH',            required: true,  section: 'Employé' },
      { key: 'employe_naissance', label: 'Date de naissance',               type: 'date',   placeholder: '',                                 required: true,  section: 'Employé' },
      { key: 'employe_adresse',   label: 'Adresse de l\'employé(e)',        type: 'text',   placeholder: 'Ex : Lambanyi, Ratoma',            required: true,  section: 'Employé' },
      { key: 'poste',             label: 'Intitulé du poste',               type: 'text',   placeholder: 'Ex : Comptable principal',         required: true,  section: 'Emploi' },
      { key: 'categorie_pro',     label: 'Catégorie professionnelle',       type: 'text',   placeholder: 'Ex : Catégorie III, échelon B',    required: false, section: 'Emploi', hint: 'Se référer à la convention collective applicable.' },
      { key: 'date_debut',        label: 'Date de prise de poste',          type: 'date',   placeholder: '',                                 required: true,  section: 'Emploi' },
      { key: 'periode_essai',     label: 'Période d\'essai',                type: 'select', placeholder: '',                                 required: true,  section: 'Emploi', options: ['1 mois', '2 mois', '3 mois', '6 mois', 'Sans période d\'essai'] },
      { key: 'salaire_brut',      label: 'Salaire brut mensuel (FG)',       type: 'number', placeholder: 'Ex : 3000000',                     required: true,  section: 'Rémunération', hint: 'Salaire minimum interprofessionnel garanti (SMIG) : 440 000 FG/mois.' },
      { key: 'horaires',          label: 'Horaires de travail',             type: 'text',   placeholder: 'Ex : Lun-Ven, 8h00-17h00',        required: true,  section: 'Conditions' },
      { key: 'lieu_travail',      label: 'Lieu de travail',                 type: 'text',   placeholder: 'Ex : Siège social à Kaloum',       required: true,  section: 'Conditions' },
      { key: 'ville',             label: 'Ville de signature',              type: 'text',   placeholder: 'Ex : Conakry',                     required: true,  section: 'Signature' },
      { key: 'date_signature',    label: 'Date de signature',               type: 'date',   placeholder: '',                                 required: true,  section: 'Signature' },
    ],
    template: `CONTRAT DE TRAVAIL À DURÉE INDÉTERMINÉE (CDI)

ENTRE LES SOUSSIGNÉS :

L'EMPLOYEUR
Raison sociale / Nom : {{employeur_nom}}
Siège social / Adresse : {{employeur_siege}}
N° RCCM : {{employeur_rccm}}
Représenté(e) par : {{representant_nom}}
Ci-après dénommé(e) « l'Employeur »,

D'UNE PART,

ET

L'EMPLOYÉ(E)
Nom et prénom(s) : {{employe_nom}}
Date de naissance : {{employe_naissance}}
Demeurant à : {{employe_adresse}}
Ci-après dénommé(e) « l'Employé(e) »,

D'AUTRE PART,

IL EST CONVENU CE QUI SUIT :

ARTICLE 1 — NATURE DU CONTRAT
Le présent contrat est conclu pour une durée indéterminée, conformément aux dispositions du Code du travail guinéen.

ARTICLE 2 — POSTE ET FONCTIONS
L'Employé(e) est engagé(e) en qualité de : {{poste}}
Catégorie professionnelle : {{categorie_pro}}
Lieu de travail : {{lieu_travail}}

ARTICLE 3 — DATE D'ENTRÉE EN FONCTION
L'Employé(e) prendra ses fonctions le : {{date_debut}}

ARTICLE 4 — PÉRIODE D'ESSAI
Le présent contrat est soumis à une période d'essai de {{periode_essai}}, renouvelable une fois. Durant cette période, chacune des parties peut y mettre fin sans préavis ni indemnité.

ARTICLE 5 — RÉMUNÉRATION
L'Employé(e) percevra un salaire brut mensuel de {{salaire_brut}} francs guinéens (FG), payable en fin de mois par virement bancaire ou en espèces.

ARTICLE 6 — HORAIRES ET CONDITIONS DE TRAVAIL
L'Employé(e) travaillera selon les horaires suivants : {{horaires}}
La durée légale de travail est fixée à 40 heures par semaine.

ARTICLE 7 — OBLIGATIONS DES PARTIES
L'Employeur s'engage à : fournir le travail convenu, assurer des conditions de travail sécurisées, verser le salaire aux échéances fixées et respecter toutes les obligations légales relatives à la sécurité sociale.
L'Employé(e) s'engage à : exécuter son travail avec diligence et loyauté, respecter le règlement intérieur, observer le secret professionnel.

ARTICLE 8 — RUPTURE DU CONTRAT
La rupture du présent contrat sera soumise aux dispositions du Code du travail guinéen, notamment les règles relatives au préavis et aux indemnités de licenciement.

ARTICLE 9 — DROIT APPLICABLE
Le présent contrat est soumis au droit guinéen et à la convention collective applicable à la profession.

Fait à {{ville}}, le {{date_signature}},
En deux (2) exemplaires originaux.

L'EMPLOYEUR                                    L'EMPLOYÉ(E)
(Signature, cachet et nom)                     (Signature et nom)

______________________                          ______________________
{{representant_nom}}                            {{employe_nom}}
Pour {{employeur_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 4. PROCURATION GÉNÉRALE
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'procuration', categorie: 'Civil', icon: 'scroll',
    titre: 'Procuration générale',
    sous_titre: 'Mandat de représentation',
    description: 'Document par lequel vous donnez à une personne de confiance le pouvoir d\'agir en votre nom pour des actes précis.',
    duree_fill: '5-7 min', difficulte: 'Facile',
    base_legale: 'Code civil guinéen, Art. 1984-2010',
    tags: ['procuration', 'mandat', 'représentation', 'pouvoir'],
    fields: [
      { key: 'mandant_nom',       label: 'Votre nom complet (mandant)',       type: 'text', placeholder: 'Ex : Oumar SYLLA',              required: true,  section: 'Mandant (vous)', hint: 'La personne qui donne la procuration est appelée "mandant".' },
      { key: 'mandant_naissance', label: 'Date de naissance (mandant)',        type: 'date', placeholder: '',                             required: true,  section: 'Mandant (vous)' },
      { key: 'mandant_cni',       label: 'N° CNI (mandant)',                  type: 'text', placeholder: 'Ex : GN-654321',               required: true,  section: 'Mandant (vous)' },
      { key: 'mandant_adresse',   label: 'Adresse (mandant)',                 type: 'text', placeholder: 'Ex : Quartier Hamdallaye',     required: true,  section: 'Mandant (vous)' },
      { key: 'mandataire_nom',    label: 'Nom du mandataire',                 type: 'text', placeholder: 'Ex : Fatoumata DIALLO',        required: true,  section: 'Mandataire', hint: 'La personne qui reçoit le pouvoir d\'agir est le "mandataire".' },
      { key: 'mandataire_cni',    label: 'N° CNI du mandataire',             type: 'text', placeholder: 'Ex : GN-111222',               required: true,  section: 'Mandataire' },
      { key: 'mandataire_adresse',label: 'Adresse du mandataire',            type: 'text', placeholder: 'Ex : Coleah, Dixinn',          required: true,  section: 'Mandataire' },
      { key: 'lien',              label: 'Lien avec le mandataire',           type: 'text', placeholder: 'Ex : époux(se), frère, ami',   required: false, section: 'Mandataire' },
      { key: 'objet_mandat',      label: 'Objet précis du mandat',            type: 'textarea', placeholder: 'Ex : Représenter le soussigné devant toute administration, signer tout document relatif à...', required: true, section: 'Mandat', hint: 'Soyez précis sur les actes autorisés. Une procuration trop large peut être risquée.' },
      { key: 'validite',          label: 'Durée de validité',                 type: 'select', placeholder: '', required: true, section: 'Mandat', options: ['3 mois', '6 mois', '1 an', '2 ans', 'Jusqu\'à révocation'] },
      { key: 'ville',             label: 'Ville',                             type: 'text', placeholder: 'Ex : Conakry',                  required: true,  section: 'Signature' },
      { key: 'date_signature',    label: 'Date',                              type: 'date', placeholder: '',                              required: true,  section: 'Signature' },
    ],
    template: `PROCURATION
(Mandat spécial / Pouvoir)

Je soussigné(e),

LE MANDANT
Nom et prénom(s) : {{mandant_nom}}
Date de naissance : {{mandant_naissance}}
N° CNI : {{mandant_cni}}
Demeurant à : {{mandant_adresse}}

DONNE POUVOIR ET MANDAT PAR LES PRÉSENTES À :

LE MANDATAIRE
Nom et prénom(s) : {{mandataire_nom}}
N° CNI : {{mandataire_cni}}
Demeurant à : {{mandataire_adresse}}
Lien avec le mandant : {{lien}}

D'EFFECTUER EN MON NOM ET POUR MON COMPTE :

{{objet_mandat}}

Le mandataire est autorisé à signer tous actes et documents nécessaires à l'accomplissement de la mission ci-dessus définie, à représenter le mandant devant toute autorité administrative ou judiciaire, et à faire généralement tout ce que le mandant pourrait faire lui-même.

DURÉE DE VALIDITÉ : {{validite}} à compter de la date de signature des présentes.

La présente procuration ne peut être utilisée qu'aux fins expressément prévues ci-dessus. Elle est révocable à tout moment par lettre adressée au mandataire.

Fait à {{ville}}, le {{date_signature}},

LE MANDANT                                     LE MANDATAIRE
(Signature précédée de la mention               (Signature précédée de la mention
« Bon pour pouvoir »)                           « Bon pour acceptation »)

______________________                          ______________________
{{mandant_nom}}                                 {{mandataire_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 5. RECONNAISSANCE DE DETTE
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'reconnaissance-dette', categorie: 'Civil', icon: 'coins',
    titre: 'Reconnaissance de dette',
    sous_titre: 'Acte de reconnaissance d\'emprunt',
    description: 'Document par lequel un débiteur reconnaît officiellement devoir une somme d\'argent à un créancier.',
    duree_fill: '5-8 min', difficulte: 'Facile',
    base_legale: 'Code civil guinéen, Art. 1326',
    tags: ['dette', 'prêt', 'remboursement', 'emprunt'],
    fields: [
      { key: 'debiteur_nom',     label: 'Nom complet du débiteur',      type: 'text',   placeholder: 'Ex : Sekou TOURÉ',            required: true,  section: 'Débiteur', hint: 'Le débiteur est celui qui doit l\'argent.' },
      { key: 'debiteur_cni',    label: 'N° CNI du débiteur',            type: 'text',   placeholder: 'Ex : GN-334455',             required: true,  section: 'Débiteur' },
      { key: 'debiteur_adresse',label: 'Adresse du débiteur',           type: 'text',   placeholder: 'Ex : Cosa, Matoto',          required: true,  section: 'Débiteur' },
      { key: 'creancier_nom',   label: 'Nom complet du créancier',      type: 'text',   placeholder: 'Ex : Mamady CONTÉ',          required: true,  section: 'Créancier', hint: 'Le créancier est celui à qui l\'argent est dû.' },
      { key: 'creancier_adresse',label: 'Adresse du créancier',         type: 'text',   placeholder: 'Ex : Kaloum, Conakry',       required: true,  section: 'Créancier' },
      { key: 'montant',         label: 'Montant emprunté (en FG)',      type: 'number', placeholder: 'Ex : 10000000',               required: true,  section: 'Prêt', hint: 'Écrivez le montant en chiffres. La loi exige qu\'il soit également écrit en lettres dans le document.' },
      { key: 'montant_lettres', label: 'Montant en lettres',            type: 'text',   placeholder: 'Ex : Dix millions de francs guinéens', required: true, section: 'Prêt' },
      { key: 'date_pret',       label: 'Date du prêt',                  type: 'date',   placeholder: '',                           required: true,  section: 'Prêt' },
      { key: 'date_remboursement', label: 'Date de remboursement prévue', type: 'date', placeholder: '',                           required: true,  section: 'Remboursement' },
      { key: 'modalites',       label: 'Modalités de remboursement',    type: 'select', placeholder: '',                           required: true,  section: 'Remboursement', options: ['En une seule fois à l\'échéance', 'Par mensualités égales', 'Par versements convenus entre les parties'] },
      { key: 'taux_interet',    label: 'Taux d\'intérêt annuel (%)',    type: 'text',   placeholder: 'Ex : 0% (sans intérêts)',     required: false, section: 'Remboursement', hint: 'Laissez "0%" pour un prêt sans intérêts entre amis ou famille.' },
      { key: 'ville',           label: 'Ville',                         type: 'text',   placeholder: 'Ex : Conakry',               required: true,  section: 'Signature' },
      { key: 'date_signature',  label: 'Date de signature',             type: 'date',   placeholder: '',                           required: true,  section: 'Signature' },
    ],
    template: `RECONNAISSANCE DE DETTE

Je soussigné(e),

LE DÉBITEUR
Nom et prénom(s) : {{debiteur_nom}}
N° CNI : {{debiteur_cni}}
Demeurant à : {{debiteur_adresse}}

RECONNAIS PAR LES PRÉSENTES DEVOIR À :

LE CRÉANCIER
Nom et prénom(s) : {{creancier_nom}}
Demeurant à : {{creancier_adresse}}

LA SOMME DE : {{montant}} FG
En lettres : {{montant_lettres}}

Cette somme m'ayant été prêtée le {{date_pret}} en espèces / par virement (rayer la mention inutile).

MODALITÉS DE REMBOURSEMENT :
Je m'engage à rembourser ladite somme {{modalites}}, au plus tard le {{date_remboursement}}.
Taux d'intérêt convenu : {{taux_interet}} par an.

En cas de non-remboursement à la date prévue, les intérêts légaux en vigueur en République de Guinée seront automatiquement applicables.

La présente reconnaissance de dette est établie conformément aux dispositions du Code civil guinéen et vaut titre exécutoire entre les parties.

Fait à {{ville}}, le {{date_signature}},
En deux (2) exemplaires originaux.

LE DÉBITEUR                                    LE CRÉANCIER
(Mention manuscrite « Bon pour la somme        (Signature)
de {{montant_lettres}} »)

______________________                          ______________________
{{debiteur_nom}}                                {{creancier_nom}}
(Signature)`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 6. LETTRE DE LICENCIEMENT
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'lettre-licenciement', categorie: 'Travail', icon: 'file',
    titre: 'Lettre de licenciement',
    sous_titre: 'Notification de rupture du contrat de travail',
    description: 'Lettre officielle de licenciement conforme aux exigences de forme du Code du travail guinéen.',
    duree_fill: '6-10 min', difficulte: 'Moyen',
    base_legale: 'Code du travail guinéen 2014, Art. 172.1-172.30',
    tags: ['licenciement', 'rupture', 'préavis', 'emploi'],
    fields: [
      { key: 'employeur_nom',    label: 'Nom / Raison sociale employeur',  type: 'text',     placeholder: 'Ex : SARL Guinée Commerce',    required: true,  section: 'Employeur' },
      { key: 'employeur_adresse',label: 'Adresse employeur',               type: 'text',     placeholder: 'Ex : Kaloum, Conakry',         required: true,  section: 'Employeur' },
      { key: 'dg_nom',           label: 'Nom du signataire (DG/DRH)',      type: 'text',     placeholder: 'Ex : M. Ibrahima BALDÉ, DG',   required: true,  section: 'Employeur' },
      { key: 'employe_nom',      label: 'Nom complet de l\'employé(e)',    type: 'text',     placeholder: 'Ex : Aissatou BARRY',          required: true,  section: 'Employé' },
      { key: 'employe_poste',    label: 'Poste occupé',                    type: 'text',     placeholder: 'Ex : Responsable Marketing',   required: true,  section: 'Employé' },
      { key: 'date_entree',      label: 'Date d\'entrée dans l\'entreprise', type: 'date',   placeholder: '',                             required: true,  section: 'Employé' },
      { key: 'motif',            label: 'Motif du licenciement',           type: 'select',   placeholder: '',                             required: true,  section: 'Licenciement', options: ['Faute grave', 'Faute lourde', 'Insuffisance professionnelle', 'Suppression de poste (motif économique)', 'Inaptitude médicalement constatée', 'Absence injustifiée répétée'] },
      { key: 'motif_detail',     label: 'Détails du motif',                type: 'textarea', placeholder: 'Précisez les faits précis ayant motivé cette décision…', required: true, section: 'Licenciement', hint: 'Le motif doit être réel, sérieux et précis. Citez les dates des faits.' },
      { key: 'preavis',          label: 'Durée du préavis',                type: 'select',   placeholder: '',                             required: true,  section: 'Conditions', options: ['Dispense de préavis (faute grave)', '1 mois', '2 mois', '3 mois'] },
      { key: 'date_licenciement',label: 'Date d\'effet du licenciement',   type: 'date',     placeholder: '',                             required: true,  section: 'Conditions' },
      { key: 'ville',            label: 'Ville',                           type: 'text',     placeholder: 'Ex : Conakry',                  required: true,  section: 'Signature' },
      { key: 'date_lettre',      label: 'Date de la lettre',               type: 'date',     placeholder: '',                              required: true,  section: 'Signature' },
    ],
    template: `LETTRE DE LICENCIEMENT
(Lettre recommandée avec avis de réception)

{{employeur_nom}}
{{employeur_adresse}}

{{ville}}, le {{date_lettre}}

À
{{employe_nom}}
Poste : {{employe_poste}}

Objet : NOTIFICATION DE LICENCIEMENT

Madame / Monsieur {{employe_nom}},

Nous vous avons convoqué(e) à un entretien préalable au licenciement, au cours duquel vous avez pu faire valoir vos observations.

À l'issue de cet entretien, nous avons maintenu notre décision de procéder à votre licenciement pour le motif suivant :

MOTIF : {{motif}}

EXPOSÉ DES FAITS :
{{motif_detail}}

Ces faits constituent un manquement suffisamment grave pour rendre impossible votre maintien dans l'entreprise.

En conséquence, nous vous notifions par la présente votre licenciement, qui prendra effet le {{date_licenciement}}.

PRÉAVIS : {{preavis}}

Conformément au Code du travail guinéen, les indemnités légales auxquelles vous pouvez prétendre, ainsi que le solde de tout compte, vous seront versés dans les délais légaux. Votre certificat de travail vous sera remis à votre départ.

Nous vous informons que vous pouvez contester cette décision devant le Tribunal du Travail compétent.

Veuillez agréer, Madame / Monsieur, nos salutations distinguées.

______________________
{{dg_nom}}
Pour {{employeur_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 7. CONTRAT DE PRESTATION DE SERVICES
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'contrat-prestation', categorie: 'Commerce', icon: 'handshake',
    titre: 'Contrat de prestation de services',
    sous_titre: 'Accord de mission entre professionnel et client',
    description: 'Contrat encadrant la réalisation d\'une mission ou prestation entre un prestataire et son client.',
    duree_fill: '8-12 min', difficulte: 'Moyen',
    base_legale: 'Code des activités économiques, Acte uniforme OHADA',
    tags: ['prestation', 'mission', 'freelance', 'contrat commercial'],
    fields: [
      { key: 'prestataire_nom',     label: 'Nom / Raison sociale prestataire', type: 'text',     placeholder: 'Ex : Conseil DIALLO SARL',    required: true,  section: 'Prestataire' },
      { key: 'prestataire_adresse', label: 'Adresse prestataire',              type: 'text',     placeholder: 'Ex : Kaloum, Conakry',        required: true,  section: 'Prestataire' },
      { key: 'prestataire_tel',     label: 'Téléphone prestataire',            type: 'text',     placeholder: 'Ex : +224 620 000 000',       required: false, section: 'Prestataire' },
      { key: 'client_nom',          label: 'Nom / Raison sociale client',      type: 'text',     placeholder: 'Ex : Alpha Entreprises',      required: true,  section: 'Client' },
      { key: 'client_adresse',      label: 'Adresse client',                   type: 'text',     placeholder: 'Ex : Matam, Conakry',         required: true,  section: 'Client' },
      { key: 'mission',             label: 'Description de la mission',        type: 'textarea', placeholder: 'Décrivez précisément la mission confiée, les livrables attendus…', required: true, section: 'Mission', hint: 'Soyez précis sur ce qui doit être livré, en quelle quantité, sous quel format.' },
      { key: 'date_debut',          label: 'Date de début de la mission',      type: 'date',     placeholder: '',                            required: true,  section: 'Mission' },
      { key: 'date_fin',            label: 'Date de fin / livraison',          type: 'date',     placeholder: '',                            required: true,  section: 'Mission' },
      { key: 'montant_ht',          label: 'Montant HT de la prestation (FG)', type: 'number',   placeholder: 'Ex : 5000000',                required: true,  section: 'Rémunération' },
      { key: 'modalite_paiement',   label: 'Modalité de paiement',            type: 'select',   placeholder: '',                            required: true,  section: 'Rémunération', options: ['100% à la livraison', '50% à la commande, 50% à la livraison', 'Par mensualités', 'À 30 jours après livraison'] },
      { key: 'ville',               label: 'Ville de signature',              type: 'text',     placeholder: 'Ex : Conakry',                required: true,  section: 'Signature' },
      { key: 'date_signature',      label: 'Date de signature',               type: 'date',     placeholder: '',                            required: true,  section: 'Signature' },
    ],
    template: `CONTRAT DE PRESTATION DE SERVICES

Entre les soussignés :

LE PRESTATAIRE
Nom / Raison sociale : {{prestataire_nom}}
Adresse : {{prestataire_adresse}}
Tél : {{prestataire_tel}}
Ci-après dénommé(e) « le Prestataire »,

D'UNE PART,

ET

LE CLIENT
Nom / Raison sociale : {{client_nom}}
Adresse : {{client_adresse}}
Ci-après dénommé(e) « le Client »,

D'AUTRE PART,

IL EST CONVENU CE QUI SUIT :

ARTICLE 1 — OBJET
Le Client confie au Prestataire, qui accepte, la mission suivante :
{{mission}}

ARTICLE 2 — DURÉE DE LA MISSION
La mission débutera le {{date_debut}} et devra être achevée au plus tard le {{date_fin}}.
Toute modification de ce délai devra faire l'objet d'un accord écrit entre les parties.

ARTICLE 3 — RÉMUNÉRATION
En contrepartie de la réalisation complète de la mission, le Client versera au Prestataire la somme de {{montant_ht}} francs guinéens (FG) hors taxes.
Modalités de paiement : {{modalite_paiement}}.

ARTICLE 4 — OBLIGATIONS DU PRESTATAIRE
Le Prestataire s'engage à :
- Exécuter la mission avec professionnalisme et diligence ;
- Respecter les délais convenus ;
- Maintenir la confidentialité des informations du Client ;
- Remettre les livrables dans les délais et la qualité convenus.

ARTICLE 5 — OBLIGATIONS DU CLIENT
Le Client s'engage à :
- Fournir toutes les informations nécessaires à l'exécution de la mission ;
- Payer la rémunération aux échéances convenues ;
- Collaborer avec le Prestataire de bonne foi.

ARTICLE 6 — PROPRIÉTÉ INTELLECTUELLE
Sauf accord contraire, les droits sur les livrables seront transférés au Client après paiement intégral de la rémunération.

ARTICLE 7 — RÉSILIATION
En cas d'inexécution grave par l'une des parties, le contrat pourra être résilié de plein droit après mise en demeure restée sans effet pendant quinze (15) jours.

ARTICLE 8 — LOI APPLICABLE ET LITIGES
Le présent contrat est régi par le droit guinéen. Tout litige sera porté devant les tribunaux compétents de Conakry.

Fait à {{ville}}, le {{date_signature}},
En deux (2) exemplaires originaux.

LE PRESTATAIRE                                 LE CLIENT
(Signature et cachet)                          (Signature et cachet)

______________________                          ______________________
{{prestataire_nom}}                             {{client_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 8. ATTESTATION SUR L'HONNEUR
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'attestation-honneur', categorie: 'Civil', icon: 'check-circle',
    titre: 'Attestation sur l\'honneur',
    sous_titre: 'Déclaration sur l\'honneur certifiée',
    description: 'Déclaration personnelle certifiée par laquelle vous attestez de la véracité de faits vous concernant.',
    duree_fill: '3-5 min', difficulte: 'Facile',
    base_legale: 'Code pénal guinéen (faux en écritures)',
    tags: ['attestation', 'déclaration', 'honneur', 'administratif'],
    fields: [
      { key: 'signataire_nom',      label: 'Votre nom complet',           type: 'text',     placeholder: 'Ex : Mamadou CAMARA',          required: true,  section: 'Signataire' },
      { key: 'signataire_naissance',label: 'Date de naissance',           type: 'date',     placeholder: '',                             required: true,  section: 'Signataire' },
      { key: 'signataire_adresse',  label: 'Adresse',                     type: 'text',     placeholder: 'Ex : Cosa, Matoto, Conakry',   required: true,  section: 'Signataire' },
      { key: 'signataire_profession',label: 'Profession',                 type: 'text',     placeholder: 'Ex : Commerçant',              required: false, section: 'Signataire' },
      { key: 'objet_attestation',   label: 'Ce que vous attestez',        type: 'textarea', placeholder: 'Ex : Atteste sur l\'honneur résider à l\'adresse indiquée depuis le…', required: true, section: 'Déclaration', hint: 'Soyez précis. Une fausse déclaration sur l\'honneur est punissable par la loi.' },
      { key: 'destination',         label: 'Destinée à',                  type: 'text',     placeholder: 'Ex : Direction Nationale des Impôts', required: false, section: 'Déclaration', hint: 'Administration ou organisme auquel l\'attestation est destinée.' },
      { key: 'ville',               label: 'Ville',                       type: 'text',     placeholder: 'Ex : Conakry',                 required: true,  section: 'Signature' },
      { key: 'date_signature',      label: 'Date',                        type: 'date',     placeholder: '',                             required: true,  section: 'Signature' },
    ],
    template: `ATTESTATION SUR L'HONNEUR

Je soussigné(e),

Nom et prénom(s) : {{signataire_nom}}
Date de naissance : {{signataire_naissance}}
Demeurant à : {{signataire_adresse}}
Profession : {{signataire_profession}}

ATTESTE SUR L'HONNEUR :

{{objet_attestation}}

La présente attestation est établie pour servir et valoir ce que de droit, notamment auprès de : {{destination}}.

Je certifie l'exactitude des informations ci-dessus et reconnais être informé(e) que toute fausse déclaration sur l'honneur est passible de poursuites pénales conformément au Code pénal de la République de Guinée.

Fait à {{ville}}, le {{date_signature}},

______________________
{{signataire_nom}}
(Signature précédée de la mention
« Lu et approuvé »)`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 9. CONTRAT DE VENTE DE BIEN MOBILIER
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'contrat-vente', categorie: 'Commerce', icon: 'shopping-bag',
    titre: 'Contrat de vente',
    sous_titre: 'Accord de cession d\'un bien',
    description: 'Contrat constatant la vente d\'un bien mobilier (véhicule, matériel, marchandises) entre particuliers ou professionnels.',
    duree_fill: '6-10 min', difficulte: 'Facile',
    base_legale: 'Code civil guinéen, Art. 1582-1701',
    tags: ['vente', 'cession', 'achat', 'transfert de propriété'],
    fields: [
      { key: 'vendeur_nom',     label: 'Nom complet du vendeur',        type: 'text',     placeholder: 'Ex : Ibrahima BALDE',          required: true,  section: 'Vendeur' },
      { key: 'vendeur_cni',     label: 'N° CNI du vendeur',             type: 'text',     placeholder: 'Ex : GN-556677',               required: true,  section: 'Vendeur' },
      { key: 'vendeur_adresse', label: 'Adresse du vendeur',            type: 'text',     placeholder: 'Ex : Quartier Kipé, Ratoma',   required: true,  section: 'Vendeur' },
      { key: 'acheteur_nom',    label: 'Nom complet de l\'acheteur',    type: 'text',     placeholder: 'Ex : Lansana KOUROUMA',        required: true,  section: 'Acheteur' },
      { key: 'acheteur_cni',    label: 'N° CNI de l\'acheteur',        type: 'text',     placeholder: 'Ex : GN-889900',               required: true,  section: 'Acheteur' },
      { key: 'acheteur_adresse',label: 'Adresse de l\'acheteur',        type: 'text',     placeholder: 'Ex : Commune de Dubréka',      required: true,  section: 'Acheteur' },
      { key: 'bien_designation',label: 'Désignation précise du bien',   type: 'textarea', placeholder: 'Ex : Un véhicule Toyota Hilux, année 2018, immatriculation RA-1234-GN, couleur blanche…', required: true, section: 'Bien vendu', hint: 'Soyez très précis : marque, modèle, numéro de série, état, accessoires inclus.' },
      { key: 'prix',            label: 'Prix de vente (en FG)',         type: 'number',   placeholder: 'Ex : 150000000',               required: true,  section: 'Prix' },
      { key: 'prix_lettres',    label: 'Prix en lettres',               type: 'text',     placeholder: 'Ex : Cent cinquante millions de francs guinéens', required: true, section: 'Prix' },
      { key: 'modalite_paiement', label: 'Modalité de paiement',       type: 'select',   placeholder: '',                             required: true,  section: 'Prix', options: ['Comptant à la signature', 'Virement bancaire', 'Par acomptes', 'À terme (crédit vendeur)'] },
      { key: 'garanties',       label: 'Garanties / Réserves',          type: 'textarea', placeholder: 'Ex : Vendu en l\'état, sans garantie. OU : Garantie de bon fonctionnement de 3 mois.', required: false, section: 'Garanties' },
      { key: 'ville',           label: 'Ville',                         type: 'text',     placeholder: 'Ex : Conakry',                 required: true,  section: 'Signature' },
      { key: 'date_signature',  label: 'Date de signature',             type: 'date',     placeholder: '',                             required: true,  section: 'Signature' },
    ],
    template: `CONTRAT DE VENTE

Entre les soussignés :

LE VENDEUR
Nom et prénom(s) : {{vendeur_nom}}
N° CNI : {{vendeur_cni}}
Demeurant à : {{vendeur_adresse}}
Ci-après dénommé(e) « le Vendeur »,

D'UNE PART,

ET

L'ACHETEUR
Nom et prénom(s) : {{acheteur_nom}}
N° CNI : {{acheteur_cni}}
Demeurant à : {{acheteur_adresse}}
Ci-après dénommé(e) « l'Acheteur »,

D'AUTRE PART,

IL EST CONVENU CE QUI SUIT :

ARTICLE 1 — VENTE
Le Vendeur vend à l'Acheteur, qui accepte, le bien ci-après désigné :
{{bien_designation}}

ARTICLE 2 — PRIX
La présente vente est consentie et acceptée au prix de {{prix}} FG
(en lettres : {{prix_lettres}}).

Le Vendeur déclare avoir reçu ce prix de l'Acheteur, qui reconnaît l'avoir payé, conformément aux modalités suivantes : {{modalite_paiement}}.

ARTICLE 3 — TRANSFERT DE PROPRIÉTÉ ET DE RISQUE
La propriété du bien est transférée à l'Acheteur à la date de signature des présentes, avec tous les droits et charges y afférents.

ARTICLE 4 — GARANTIES
{{garanties}}

Le Vendeur certifie que le bien est libre de tout gage, nantissement ou saisie.

ARTICLE 5 — DÉCLARATION DU VENDEUR
Le Vendeur déclare sur l'honneur être le propriétaire légitime du bien vendu et avoir la pleine capacité d'en disposer.

ARTICLE 6 — DROIT APPLICABLE
Le présent contrat est régi par le droit guinéen.

Fait à {{ville}}, le {{date_signature}},
En deux (2) exemplaires originaux.

LE VENDEUR                                     L'ACHETEUR
(Signature et nom)                              (Signature et nom)

______________________                          ______________________
{{vendeur_nom}}                                 {{acheteur_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 10. DEMANDE DE CONGÉ
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'demande-conge', categorie: 'Travail', icon: 'calendar',
    titre: 'Demande de congé',
    sous_titre: 'Lettre de demande de congé payé ou sans solde',
    description: 'Lettre formelle adressée à l\'employeur pour solliciter une période de congé.',
    duree_fill: '3-5 min', difficulte: 'Facile',
    base_legale: 'Code du travail guinéen 2014, Art. 200-215',
    tags: ['congé', 'vacances', 'absence', 'travail'],
    fields: [
      { key: 'employe_nom',     label: 'Votre nom complet',              type: 'text',   placeholder: 'Ex : Fatoumata SOUMAH',           required: true,  section: 'Vous' },
      { key: 'employe_poste',   label: 'Votre poste',                    type: 'text',   placeholder: 'Ex : Assistante Comptable',        required: true,  section: 'Vous' },
      { key: 'responsable_nom', label: 'Nom de votre responsable / DG',  type: 'text',   placeholder: 'Ex : M. Mamadou DIALLO, DRH',     required: true,  section: 'Destinataire' },
      { key: 'type_conge',      label: 'Type de congé',                  type: 'select', placeholder: '',                                 required: true,  section: 'Congé', options: ['Congé annuel payé', 'Congé sans solde', 'Congé maladie', 'Congé maternité/paternité', 'Congé exceptionnel (événement familial)'] },
      { key: 'date_debut',      label: 'Date de début du congé',         type: 'date',   placeholder: '',                                 required: true,  section: 'Congé' },
      { key: 'date_fin',        label: 'Date de fin du congé',           type: 'date',   placeholder: '',                                 required: true,  section: 'Congé' },
      { key: 'nb_jours',        label: 'Nombre de jours',                type: 'number', placeholder: 'Ex : 10',                          required: true,  section: 'Congé' },
      { key: 'motif',           label: 'Motif (optionnel)',               type: 'text',   placeholder: 'Ex : Vacances familiales',         required: false, section: 'Congé', hint: 'Facultatif pour un congé annuel. Obligatoire pour un congé exceptionnel.' },
      { key: 'remplacement',    label: 'Personne assurant votre remplacement', type: 'text', placeholder: 'Ex : M. Sidikiba KEITA',        required: false, section: 'Congé' },
      { key: 'ville',           label: 'Ville',                          type: 'text',   placeholder: 'Ex : Conakry',                     required: true,  section: 'Signature' },
      { key: 'date_lettre',     label: 'Date de la lettre',              type: 'date',   placeholder: '',                                 required: true,  section: 'Signature' },
    ],
    template: `DEMANDE DE CONGÉ

{{employe_nom}}
{{employe_poste}}

{{ville}}, le {{date_lettre}}

À
{{responsable_nom}}

Objet : Demande de {{type_conge}}

Madame / Monsieur {{responsable_nom}},

J'ai l'honneur de vous adresser la présente afin de solliciter, sauf avis contraire de votre part, un {{type_conge}} d'une durée de {{nb_jours}} jour(s) ouvrable(s), du {{date_debut}} au {{date_fin}} inclus.{{motif}}

Durant mon absence, {{remplacement}} assurera mon remplacement et prendra en charge les dossiers urgents.

Je reste disponible pour tout renseignement complémentaire et vous remercie de bien vouloir accorder une suite favorable à ma demande.

Dans l'attente de votre accord, veuillez agréer, Madame / Monsieur, l'expression de mes respectueuses salutations.

______________________
{{employe_nom}}
(Signature)

---
AVIS DE LA HIÉRARCHIE :
☐ Accordé      ☐ Refusé      ☐ Différé au : _____________

Signature et cachet : ___________________   Date : _______________`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 11. CONTRAT DE PRÊT ENTRE PARTICULIERS
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'contrat-pret', categorie: 'Civil', icon: 'wallet',
    titre: 'Contrat de prêt entre particuliers',
    sous_titre: 'Accord de prêt d\'argent formalisé',
    description: 'Contrat formalisant un prêt d\'argent avec plan de remboursement défini, protégeant les deux parties.',
    duree_fill: '7-10 min', difficulte: 'Moyen',
    base_legale: 'Code civil guinéen, Art. 1892-1899',
    tags: ['prêt', 'emprunt', 'remboursement', 'finance'],
    fields: [
      { key: 'preteur_nom',      label: 'Nom complet du prêteur',      type: 'text',     placeholder: 'Ex : Boubacar SOUMAH',           required: true,  section: 'Prêteur', hint: 'Le prêteur est celui qui prête l\'argent.' },
      { key: 'preteur_cni',      label: 'N° CNI du prêteur',           type: 'text',     placeholder: 'Ex : GN-223344',                 required: true,  section: 'Prêteur' },
      { key: 'preteur_adresse',  label: 'Adresse du prêteur',          type: 'text',     placeholder: 'Ex : Commune de Kaloum',         required: true,  section: 'Prêteur' },
      { key: 'emprunteur_nom',   label: 'Nom complet de l\'emprunteur', type: 'text',    placeholder: 'Ex : Naby KEITA',               required: true,  section: 'Emprunteur' },
      { key: 'emprunteur_cni',   label: 'N° CNI de l\'emprunteur',    type: 'text',     placeholder: 'Ex : GN-556677',                 required: true,  section: 'Emprunteur' },
      { key: 'emprunteur_adresse', label: 'Adresse de l\'emprunteur', type: 'text',      placeholder: 'Ex : Quartier Madina',           required: true,  section: 'Emprunteur' },
      { key: 'montant',          label: 'Montant du prêt (FG)',        type: 'number',   placeholder: 'Ex : 20000000',                   required: true,  section: 'Prêt' },
      { key: 'montant_lettres',  label: 'Montant en lettres',          type: 'text',     placeholder: 'Ex : Vingt millions de francs guinéens', required: true, section: 'Prêt' },
      { key: 'date_versement',   label: 'Date de versement',           type: 'date',     placeholder: '',                               required: true,  section: 'Prêt' },
      { key: 'taux_interet',     label: 'Taux d\'intérêt annuel (%)', type: 'text',     placeholder: 'Ex : 0 (sans intérêts)',         required: true,  section: 'Remboursement', hint: 'Un prêt entre proches est souvent sans intérêts (0%). Indiquez "0" si sans intérêts.' },
      { key: 'nb_echeances',     label: 'Nombre de mensualités',       type: 'number',   placeholder: 'Ex : 12',                        required: true,  section: 'Remboursement' },
      { key: 'montant_echeance', label: 'Montant par mensualité (FG)', type: 'number',   placeholder: 'Ex : 1666667',                   required: true,  section: 'Remboursement' },
      { key: 'date_premiere_echeance', label: 'Date 1ère échéance',   type: 'date',     placeholder: '',                               required: true,  section: 'Remboursement' },
      { key: 'date_derniere_echeance', label: 'Date dernière échéance', type: 'date',   placeholder: '',                               required: true,  section: 'Remboursement' },
      { key: 'ville',            label: 'Ville',                       type: 'text',     placeholder: 'Ex : Conakry',                   required: true,  section: 'Signature' },
      { key: 'date_signature',   label: 'Date',                        type: 'date',     placeholder: '',                               required: true,  section: 'Signature' },
    ],
    template: `CONTRAT DE PRÊT ENTRE PARTICULIERS

Entre les soussignés :

LE PRÊTEUR
Nom et prénom(s) : {{preteur_nom}}
N° CNI : {{preteur_cni}}
Demeurant à : {{preteur_adresse}}
Ci-après dénommé(e) « le Prêteur »,

D'UNE PART,

ET

L'EMPRUNTEUR
Nom et prénom(s) : {{emprunteur_nom}}
N° CNI : {{emprunteur_cni}}
Demeurant à : {{emprunteur_adresse}}
Ci-après dénommé(e) « l'Emprunteur »,

D'AUTRE PART,

ARTICLE 1 — PRÊT
Le Prêteur consent à l'Emprunteur, qui accepte, un prêt de {{montant}} FG
(en lettres : {{montant_lettres}}),
versé ce jour par [espèces / virement] (rayer la mention inutile), le {{date_versement}}.
L'Emprunteur reconnaît avoir reçu cette somme.

ARTICLE 2 — TAUX D'INTÉRÊT
Le présent prêt porte intérêt au taux annuel de {{taux_interet}} %.

ARTICLE 3 — REMBOURSEMENT
L'Emprunteur s'engage à rembourser le prêt en {{nb_echeances}} mensualités de {{montant_echeance}} FG chacune.
Première échéance : {{date_premiere_echeance}}
Dernière échéance : {{date_derniere_echeance}}

ARTICLE 4 — DÉFAUT DE PAIEMENT
En cas de non-paiement d'une échéance à sa date, l'intégralité du solde restant dû deviendra immédiatement exigible, sans mise en demeure préalable.

ARTICLE 5 — LOI APPLICABLE
Le présent contrat est soumis au droit guinéen. Tout litige sera porté devant les tribunaux compétents de Conakry.

Fait à {{ville}}, le {{date_signature}},
En deux (2) exemplaires originaux.

LE PRÊTEUR                                     L'EMPRUNTEUR
(Signature)                                     (Mention « Bon pour emprunt de
                                                {{montant_lettres}} » + signature)

______________________                          ______________________
{{preteur_nom}}                                 {{emprunteur_nom}}`,
  },

  // ──────────────────────────────────────────────────────────────────────────
  // 12. PV D'ASSEMBLÉE GÉNÉRALE
  // ──────────────────────────────────────────────────────────────────────────
  {
    id: 'pv-ag', categorie: 'Commerce', icon: 'landmark',
    titre: 'PV d\'assemblée générale',
    sous_titre: 'Procès-verbal d\'AG ordinaire ou extraordinaire',
    description: 'Document officiel constatant les décisions prises lors d\'une assemblée générale d\'association ou de société.',
    duree_fill: '8-12 min', difficulte: 'Moyen',
    base_legale: 'Acte uniforme OHADA sur les sociétés, Code des associations guinéen',
    tags: ['assemblée générale', 'PV', 'réunion', 'décisions', 'société'],
    fields: [
      { key: 'entite_nom',      label: 'Nom de l\'entité',              type: 'text',     placeholder: 'Ex : Association JeunesGuinée / SARL TechConakry', required: true,  section: 'Entité' },
      { key: 'entite_type',     label: 'Type d\'entité',                type: 'select',   placeholder: '',                              required: true,  section: 'Entité', options: ['Association', 'SARL', 'SA', 'EURL', 'GIE', 'Coopérative'] },
      { key: 'type_ag',         label: 'Type d\'assemblée',             type: 'select',   placeholder: '',                              required: true,  section: 'Assemblée', options: ['Assemblée Générale Ordinaire (AGO)', 'Assemblée Générale Extraordinaire (AGE)', 'Assemblée Générale Mixte'] },
      { key: 'date_ag',         label: 'Date de l\'assemblée',          type: 'date',     placeholder: '',                             required: true,  section: 'Assemblée' },
      { key: 'heure_ag',        label: 'Heure de début',                type: 'text',     placeholder: 'Ex : 10h00',                    required: true,  section: 'Assemblée' },
      { key: 'lieu_ag',         label: 'Lieu de l\'assemblée',          type: 'text',     placeholder: 'Ex : Siège social, Kaloum',     required: true,  section: 'Assemblée' },
      { key: 'president_nom',   label: 'Nom du Président de séance',   type: 'text',     placeholder: 'Ex : Mamadou SORY',             required: true,  section: 'Bureau' },
      { key: 'secretaire_nom',  label: 'Nom du Secrétaire de séance',  type: 'text',     placeholder: 'Ex : Aminata CAMARA',           required: true,  section: 'Bureau' },
      { key: 'membres_presents',label: 'Membres présents',              type: 'textarea', placeholder: 'Listez les noms et qualités des membres présents ou représentés…', required: true, section: 'Participants' },
      { key: 'ordre_du_jour',   label: 'Ordre du jour',                 type: 'textarea', placeholder: '1. Approbation du rapport moral\n2. Approbation des comptes\n3. Questions diverses', required: true, section: 'Déroulement' },
      { key: 'deliberations',   label: 'Délibérations et résolutions',  type: 'textarea', placeholder: 'Résumez les discussions et inscrivez les résolutions votées (POUR / CONTRE / ABSTENTION)…', required: true, section: 'Déroulement' },
      { key: 'heure_cloture',   label: 'Heure de clôture',             type: 'text',     placeholder: 'Ex : 13h30',                    required: true,  section: 'Clôture' },
      { key: 'ville',           label: 'Ville',                         type: 'text',     placeholder: 'Ex : Conakry',                  required: true,  section: 'Signature' },
    ],
    template: `PROCÈS-VERBAL D'ASSEMBLÉE GÉNÉRALE

{{type_ag}}
{{entite_nom}}

Date : {{date_ag}}       Heure de début : {{heure_ag}}
Lieu : {{lieu_ag}}

════════════════════════════════════════════════════════

BUREAU DE SÉANCE
Président de séance : {{president_nom}}
Secrétaire de séance : {{secretaire_nom}}

MEMBRES PRÉSENTS OU REPRÉSENTÉS :
{{membres_presents}}

ORDRE DU JOUR :
{{ordre_du_jour}}

════════════════════════════════════════════════════════

DÉROULEMENT DE L'ASSEMBLÉE

{{president_nom}}, Président de séance, déclare l'assemblée ouverte et constate que le quorum est atteint.

DÉLIBÉRATIONS ET RÉSOLUTIONS :
{{deliberations}}

════════════════════════════════════════════════════════

CLÔTURE
L'ordre du jour étant épuisé, {{president_nom}} déclare la séance close à {{heure_cloture}}.

Le présent procès-verbal est établi, approuvé et signé séance tenante par les membres du bureau.

Fait à {{ville}}, le {{date_ag}},

LE PRÉSIDENT DE SÉANCE                          LA SECRÉTAIRE DE SÉANCE

______________________                          ______________________
{{president_nom}}                               {{secretaire_nom}}`,
  },
];

// ── Config catégories ─────────────────────────────────────────────────────────
const CATEGORIES_CONFIG: Record<string, { color: string; icon: string }> = {
  'Foncier':       { color: '#d97706', icon: 'home' },
  'Civil':         { color: '#7c3aed', icon: 'scale' },
  'Travail':       { color: '#059669', icon: 'briefcase' },
  'Commerce':      { color: '#FF5A00', icon: 'building' },
  'Pénal':         { color: '#dc2626', icon: 'alert' },
  'Administratif': { color: '#FF8A00', icon: 'landmark' },
  'Famille':       { color: '#db2777', icon: 'users' },
};

const CATEGORIES_ALL = ['Tous', ...Object.keys(CATEGORIES_CONFIG)];

const THINKING_STEPS = [
  'Lecture du formulaire…',
  'Analyse des données juridiques…',
  'Application du droit guinéen…',
  'Rédaction du document…',
  'Finalisation…',
];

// ── Composant ─────────────────────────────────────────────────────────────────
@Component({
  selector:    'app-forms',
  imports:     [CommonModule, FormsModule, UiIcon],
  templateUrl: './forms.html',
  styleUrl:    './forms.scss',
})
export class Forms implements OnDestroy {
  private svc = inject(EncyclopediaService);

  readonly ALL_FORMS         = FORMS;
  readonly CATEGORIES_ALL    = CATEGORIES_ALL;
  readonly CATEGORIES_CONFIG = CATEGORIES_CONFIG;
  readonly thinkingMessages  = THINKING_STEPS;

  // ── Navigation ────────────────────────────────────────────────────────────
  viewMode   = signal<ViewMode>('library');
  activeForm = signal<LegalForm | null>(null);

  // ── Filtres ───────────────────────────────────────────────────────────────
  searchQuery      = signal('');
  selectedCategory = signal('Tous');
  selectedDiff     = signal('');

  // ── Formulaire ────────────────────────────────────────────────────────────
  formData = signal<Record<string, string>>({});

  // ── Aide IA par champ ─────────────────────────────────────────────────────
  helpFieldKey  = signal<string | null>(null);
  helpStage     = signal<HelpStage>('idle');
  helpText      = signal<string>('');
  helpError     = signal<string>('');

  // ── Amélioration IA (document complet) ────────────────────────────────────
  polishStage   = signal<PolishStage>('idle');
  polishedDoc   = signal<string>('');
  polishError   = signal<string>('');
  thinkingStep  = signal<number>(0);
  private _timer?: ReturnType<typeof setInterval>;

  // ── Copié ─────────────────────────────────────────────────────────────────
  copied = signal(false);

  // ── Sections expansées ────────────────────────────────────────────────────
  expandedSections = signal<Record<string, boolean>>({});

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly filteredForms = computed(() => {
    const cat  = this.selectedCategory();
    const diff = this.selectedDiff();
    const q    = this.searchQuery().toLowerCase().trim();
    return FORMS.filter(f => {
      if (cat !== 'Tous' && f.categorie !== cat) return false;
      if (diff && f.difficulte !== diff) return false;
      if (q && !f.titre.toLowerCase().includes(q)
           && !f.description.toLowerCase().includes(q)
           && !f.tags.some(t => t.includes(q))) return false;
      return true;
    });
  });

  readonly statsParCategorie = computed(() =>
    Object.keys(CATEGORIES_CONFIG).map(cat => ({
      cat,
      count: FORMS.filter(f => f.categorie === cat).length,
      ...CATEGORIES_CONFIG[cat],
    })).filter(s => s.count > 0)
  );

  // Sections du formulaire actif (groupées)
  readonly formSections = computed(() => {
    const form = this.activeForm();
    if (!form) return [];
    const map = new Map<string, FormField[]>();
    for (const f of form.fields) {
      const sec = f.section ?? 'Général';
      if (!map.has(sec)) map.set(sec, []);
      map.get(sec)!.push(f);
    }
    return Array.from(map.entries()).map(([section, fields]) => ({ section, fields }));
  });

  // Prévisualisation temps réel
  readonly previewText = computed(() => {
    const form = this.activeForm();
    if (!form) return '';
    const data = this.formData();
    return form.template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = (data[key] ?? '').trim();
      return val || `_______________`;
    });
  });

  // Progression remplissage
  readonly fillProgress = computed(() => {
    const form = this.activeForm();
    if (!form) return 0;
    const data     = this.formData();
    const required = form.fields.filter(f => f.required);
    if (!required.length) return 100;
    const filled   = required.filter(f => (data[f.key] ?? '').trim());
    return Math.round((filled.length / required.length) * 100);
  });

  readonly requiredCount = computed(() => this.activeForm()?.fields.filter(f => f.required).length ?? 0);
  readonly filledCount   = computed(() => {
    const form = this.activeForm();
    if (!form) return 0;
    const data = this.formData();
    return form.fields.filter(f => f.required && (data[f.key] ?? '').trim()).length;
  });

  readonly canPolish = computed(() => this.fillProgress() >= 50);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnDestroy() { this._stopThinking(); }

  // ── Navigation ────────────────────────────────────────────────────────────
  selectForm(f: LegalForm) {
    this.activeForm.set(f);
    this.formData.set({});
    this.helpFieldKey.set(null);
    this.helpStage.set('idle');
    this.helpText.set('');
    this.polishStage.set('idle');
    this.polishedDoc.set('');
    this.copied.set(false);
    // Expand first section by default
    const sections = this._getSections(f);
    const initExp: Record<string, boolean> = {};
    if (sections.length > 0) initExp[sections[0]] = true;
    this.expandedSections.set(initExp);
    this.viewMode.set('fill');
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  }

  goBack() {
    this.viewMode.set('library');
    this.activeForm.set(null);
    this._stopThinking();
  }

  // ── Gestion formulaire ────────────────────────────────────────────────────
  getField(key: string): string {
    return this.formData()[key] ?? '';
  }

  setField(key: string, value: string) {
    this.formData.update(d => ({ ...d, [key]: value }));
  }

  trackSection(i: number, item: { section: string }) { return item.section; }
  trackField(i: number, field: FormField) { return field.key; }

  toggleSection(section: string) {
    this.expandedSections.update(s => ({ ...s, [section]: !s[section] }));
  }

  isSectionExpanded(section: string): boolean {
    return this.expandedSections()[section] ?? false;
  }

  // ── Aide IA par champ ─────────────────────────────────────────────────────
  askHelp(field: FormField) {
    if (this.helpFieldKey() === field.key && this.helpStage() !== 'idle') {
      this.helpFieldKey.set(null);
      this.helpStage.set('idle');
      return;
    }
    const form = this.activeForm();
    if (!form) return;

    this.helpFieldKey.set(field.key);
    this.helpStage.set('loading');
    this.helpText.set('');
    this.helpError.set('');

    const q = `Dans le cadre de la rédaction d'un "${form.titre}" selon le droit guinéen, aide-moi à remplir le champ "${field.label}".${field.hint ? ' Contexte : ' + field.hint : ''} Explique en 2-3 phrases ce que je dois écrire dans ce champ et donne un exemple concret pour la Guinée.`;

    this.svc.askCode(q, '').subscribe({
      next: (res: AskCodeResponse) => {
        this.helpText.set(res.answer);
        this.helpStage.set('done');
      },
      error: (err: any) => {
        this.helpError.set(err.error?.detail ?? 'Erreur — réessayez.');
        this.helpStage.set('error');
      },
    });
  }

  closeHelp() {
    this.helpFieldKey.set(null);
    this.helpStage.set('idle');
    this.helpText.set('');
  }

  // ── Amélioration IA du document ───────────────────────────────────────────
  polishWithAI() {
    const form = this.activeForm();
    if (!form) return;

    this.polishStage.set('loading');
    this.polishedDoc.set('');
    this.polishError.set('');
    this._startThinking();

    const preview = this.previewText();
    const q = `Tu es un juriste expert en droit guinéen. Améliore et complète le document juridique suivant pour le rendre parfaitement conforme au droit guinéen, professionnel et complet. Comble les champs manquants avec des formulations légales standard. Conserve toute la structure et les informations déjà renseignées.

TYPE DE DOCUMENT : ${form.titre}
BASE LÉGALE : ${form.base_legale}

DOCUMENT À AMÉLIORER :
${preview}

Retourne uniquement le document amélioré, sans commentaire.`;

    this.svc.askCode(q, '').subscribe({
      next: (res: AskCodeResponse) => {
        this._stopThinking();
        this.polishedDoc.set(res.answer);
        this.polishStage.set('done');
      },
      error: (err: any) => {
        this._stopThinking();
        this.polishError.set(err.error?.detail ?? 'Erreur lors de l\'amélioration IA.');
        this.polishStage.set('error');
      },
    });
  }

  // ── Copie / Impression ────────────────────────────────────────────────────
  copyDoc() {
    const text = this.polishStage() === 'done' && this.polishedDoc()
      ? this.polishedDoc()
      : this.previewText();
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  printDoc() {
    const text = this.polishStage() === 'done' && this.polishedDoc()
      ? this.polishedDoc()
      : this.previewText();
    const win = window.open('', '_blank');
    if (!win) return;
    const form = this.activeForm();
    win.document.write(`<!DOCTYPE html><html><head><title>${form?.titre ?? 'Document'}</title>
    <style>body{font-family:Georgia,serif;font-size:12pt;line-height:1.7;padding:40px;max-width:700px;margin:0 auto;}pre{white-space:pre-wrap;font-family:inherit;}</style>
    </head><body><pre>${text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`);
    win.document.close();
    win.print();
  }

  // ── Filtres ───────────────────────────────────────────────────────────────
  selectCategory(cat: string) { this.selectedCategory.set(cat); }
  clearSearch()  { this.searchQuery.set(''); }
  clearFilters() { this.searchQuery.set(''); this.selectedCategory.set('Tous'); this.selectedDiff.set(''); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  catColor(cat: string): string  { return CATEGORIES_CONFIG[cat]?.color ?? '#64748b'; }
  catIcon(cat: string): string   { return CATEGORIES_CONFIG[cat]?.icon  ?? 'clipboard'; }

  diffClass(d: string): string {
    return { 'Facile': 'diff--easy', 'Moyen': 'diff--med', 'Complexe': 'diff--hard' }[d] ?? '';
  }

  sectionFilledCount(fields: FormField[]): number {
    const data = this.formData();
    return fields.filter(f => (data[f.key] ?? '').trim()).length;
  }

  hasEmptyRequired(): boolean {
    const form = this.activeForm();
    if (!form) return false;
    const data = this.formData();
    return form.fields.some(f => f.required && !(data[f.key] ?? '').trim());
  }

  private _getSections(form: LegalForm): string[] {
    const seen = new Set<string>();
    for (const f of form.fields) {
      const sec = f.section ?? 'Général';
      seen.add(sec);
    }
    return Array.from(seen);
  }

  private _startThinking() {
    this.thinkingStep.set(0);
    this._timer = setInterval(() => {
      this.thinkingStep.update(s => s < THINKING_STEPS.length - 1 ? s + 1 : s);
    }, 1800);
  }

  private _stopThinking() {
    clearInterval(this._timer);
  }
}

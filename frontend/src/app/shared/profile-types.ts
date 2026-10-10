export interface ProfileType {
  key: string;
  label: string;
  description: string;
  icon: string;
  showBar: boolean;
  barLabel: string;
}

export const PROFILE_TYPES: ProfileType[] = [
  {
    key: 'citoyen',   label: 'Citoyen',           icon: 'citizen',
    description: 'Particulier cherchant des informations juridiques',
    showBar: false, barLabel: '',
  },
  {
    key: 'etudiant',  label: 'Étudiant en droit',  icon: 'student',
    description: 'Étudiant en faculté de droit ou de sciences juridiques',
    showBar: false, barLabel: '',
  },
  {
    key: 'avocat',    label: 'Avocat',              icon: 'lawyer',
    description: 'Avocat inscrit au barreau',
    showBar: true, barLabel: 'N° d\'inscription au barreau',
  },
  {
    key: 'notaire',   label: 'Notaire',             icon: 'notary',
    description: 'Notaire ou collaborateur d\'étude notariale',
    showBar: true, barLabel: 'N° de chambre notariale',
  },
  {
    key: 'magistrat', label: 'Magistrat / Juge',    icon: 'judge',
    description: 'Magistrat de siège, juge d\'instruction, etc.',
    showBar: true, barLabel: 'Tribunal d\'affectation',
  },
  {
    key: 'procureur', label: 'Procureur / Parquet', icon: 'prosecutor',
    description: 'Procureur, substitut, magistrat du parquet',
    showBar: true, barLabel: 'Parquet / Tribunal',
  },
  {
    key: 'greffier',  label: 'Greffier',            icon: 'clerk',
    description: 'Greffier ou agent de greffe',
    showBar: true, barLabel: 'Greffe d\'affectation',
  },
  {
    key: 'huissier',  label: 'Huissier de justice', icon: 'bailiff',
    description: 'Huissier ou mandataire judiciaire',
    showBar: true, barLabel: 'Chambre d\'huissiers',
  },
  {
    key: 'juriste',   label: 'Juriste d\'entreprise', icon: 'corporate',
    description: 'Juriste, compliance officer, DRH',
    showBar: false, barLabel: '',
  },
  {
    key: 'chercheur', label: 'Chercheur / Enseignant', icon: 'researcher',
    description: 'Chercheur en droit, professeur, universitaire',
    showBar: false, barLabel: '',
  },
  {
    key: 'autre',     label: 'Autre',               icon: 'other',
    description: 'Autre profil professionnel ou personnel',
    showBar: false, barLabel: '',
  },
];

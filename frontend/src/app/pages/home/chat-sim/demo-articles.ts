/**
 * Sélection d'articles RÉELS pour le chat de démonstration de l'accueil.
 * Tout est préparé à l'avance : aucun appel au backend ni au modèle de langage.
 * Chaque extrait est le texte exact de l'article tel qu'indexé dans
 * model/03_vectorstore (vérifié le 2026-10-10). Les réponses reformulent
 * uniquement ce que dit l'extrait. Ne jamais ajouter d'article sans avoir lu
 * son texte réel dans l'index.
 */
export interface CodexArticle {
  id: string;
  ref: string;
  source: string;
  domain: string;
  answer: string;
  excerpt: string;
}

const TRAVAIL = 'Code du travail 2014 · L/2014/072/CNT';

export const CODEX_ARTICLES: CodexArticle[] = [
  {
    id: '121.6', ref: 'Art. 121.6', source: TRAVAIL, domain: 'Droit du travail',
    answer: "La période d'essai ne peut pas dépasser trois mois pour un cadre, et un mois pour les autres salariés, renouvellement compris.",
    excerpt: "« … ne peut, en aucun cas, même s'il y a renouvellement, être supérieure, à trois mois lorsque le travailleur embauché est un cadre, et à un mois dans les autres cas. »",
  },
  {
    id: '172.23', ref: 'Art. 172.23', source: TRAVAIL, domain: 'Droit du travail',
    answer: "Le préavis dépend de la catégorie : trois mois pour un cadre, deux mois pour un agent de maîtrise, un mois pour le personnel d'exécution.",
    excerpt: "« La période de préavis est fonction de la catégorie professionnelle du salarié. Elle est de trois mois pour le personnel cadre et assimilé, deux mois pour les agents de maîtrise et contremaître et un mois pour le personnel d'exécution. »",
  },
  {
    id: '241', ref: 'Art. 241', source: 'Code civil 2019', domain: 'Droit de la famille',
    answer: "Le mariage n'est pas permis avant 18 ans, pour l'homme comme pour la femme.",
    excerpt: "« Les garçons et les filles de moins de 18 ans ne peuvent contracter mariage. »",
  },
  {
    id: '153.1', ref: 'Art. 153.1', source: TRAVAIL, domain: 'Droit du travail',
    answer: "La salariée peut suspendre son contrat à partir de six semaines avant la date présumée de l'accouchement, et jusqu'à huit semaines après.",
    excerpt: "« La femme salariée a le droit de suspendre le contrat de travail pendant une période qui commence six semaines avant la date présumée de l'accouchement et se termine huit semaines après la date de celui-ci. »",
  },
  {
    id: '153.3', ref: 'Art. 153.3', source: TRAVAIL, domain: 'Droit du travail',
    answer: "Pendant le congé de maternité, la salariée a droit aux soins médicaux et perçoit la moitié de son salaire ; la Caisse nationale de sécurité sociale lui verse l'autre moitié.",
    excerpt: "« Elle bénéficie en plus de la moitié du salaire qu'elle percevait au moment de la suspension du travail. La Caisse Nationale de Sécurité Sociale verse à la salariée l'autre moitié de son salaire. »",
  },
  {
    id: '122.3', ref: 'Art. 122.3', source: TRAVAIL, domain: 'Droit du travail',
    answer: "Un contrat à durée déterminée ne peut pas dépasser deux ans au total, renouvellements compris.",
    excerpt: "« Les contrats comportant un terme précis ne peuvent être conclus pour une durée supérieure à deux ans. Ils peuvent être renouvelés à condition que la durée totale, renouvellement y compris, ne dépasse deux ans. »",
  },
  {
    id: '121.8', ref: 'Art. 121.8', source: TRAVAIL, domain: 'Droit du travail',
    answer: "Une clause de non-concurrence ne vaut que si le salarié part de lui-même ou commet une faute lourde ; elle est limitée à un an et à un rayon de trente kilomètres.",
    excerpt: "« … l'interdiction ne peut porter que sur une activité de nature à concurrencer l'employeur ; elle ne peut dépasser un an et ne peut s'appliquer que dans un rayon de trente kilomètres. »",
  },
  {
    id: '142.12', ref: 'Art. 142.12', source: TRAVAIL, domain: 'Droit du travail',
    answer: "Les deux premiers mois d'apprentissage valent période d'essai : chacune des parties peut alors rompre le contrat de sa seule volonté.",
    excerpt: "« Les deux premiers mois de l'apprentissage sont considérés comme temps d'essai pendant lequel le contrat peut être rompu par la seule volonté de l'une des parties. »",
  },
  {
    id: '172.1', ref: 'Art. 172.1', source: TRAVAIL, domain: 'Droit du travail',
    answer: "Quand l'employeur rompt un CDI après la période d'essai, il s'agit juridiquement d'un licenciement.",
    excerpt: "« La rupture d'un contrat de travail à durée indéterminée, après l'expiration de la période d'essai, qui résulte d'une initiative de l'employeur est un licenciement. »",
  },
];

/** Questions proposées dans le chat de démonstration, chacune reliée à son article. */
export const DEMO_QUESTIONS: { q: string; articleId: string }[] = [
  { q: "Durée de la période d'essai d'un cadre ?", articleId: '121.6' },
  { q: 'Combien de temps dure un congé de maternité ?', articleId: '153.1' },
  { q: 'Suis-je payée pendant mon congé de maternité ?', articleId: '153.3' },
  { q: 'Quel préavis si je démissionne ?', articleId: '172.23' },
  { q: 'Un CDD peut-il dépasser deux ans ?', articleId: '122.3' },
  { q: 'Une clause de non-concurrence est-elle valable ?', articleId: '121.8' },
  { q: 'À quel âge peut-on se marier ?', articleId: '241' },
  { q: "Que dit la loi sur la période d'essai d'un apprenti ?", articleId: '142.12' },
  { q: "C'est quoi, juridiquement, un licenciement ?", articleId: '172.1' },
];

export function articleById(id: string): CodexArticle | undefined {
  return CODEX_ARTICLES.find(a => a.id === id);
}

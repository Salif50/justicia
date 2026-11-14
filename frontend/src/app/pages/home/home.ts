import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { LibraryService, PublicFigures } from '../../services/library.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { ContentService, Testimonial, Partner, SiteConfig } from '../../services/content';
import { environment } from '../../../environments/environment';
import { Reveal } from '../../core/reveal.directive';
import { GuineaMap } from './guinea-map/guinea-map';
import { SeoService, faqJsonLd } from '../../core/seo/seo.service';
import { SITE_URL } from '../../core/seo/public-pages';
import exportedFigures from '../seo/data/figures.json';
import exportedGuide from '../seo/data/entreprise.json';
import exportedJo from '../seo/data/jo-index.json';
import exportedTextes from '../seo/data/textes.json';

/**
 * Chiffres exportés du corpus (scripts/export_public_data.py) : la page pré-rendue
 * les contient d'emblée ; l'API les remplace ensuite par les valeurs du jour.
 */
const INITIAL_FIGURES: PublicFigures = {
  ...exportedFigures,
  principaux_textes: [...exportedTextes].filter(t => t.famille === 'code' || t.famille === 'loi')
    .sort((a, b) => b.articles - a.articles).slice(0, 10)
    .map(t => ({ titre: t.nom, annee: t.annee, articles: t.articles })),
  creation_entreprise: exportedGuide,
  journal_recent: exportedJo.recents.slice(0, 4).map(n => ({
    numero: n.numero, special: n.special, date: n.date, titre: n.titre, nb_textes: n.entrees.length,
    apercu: n.entrees.slice(0, 3),
  })),
};

// Valeurs remplacées au chargement par les chiffres réels du corpus (/public/corpus-figures)
const LEDGER = [
  { label: 'Textes en vigueur', value: exportedFigures.textes_en_vigueur },
  { label: 'Articles indexés', value: exportedFigures.articles },
  { label: 'Réponses sans source', value: 0 },
];

const STEPS = [
  {
    title: 'Vous posez la question',
    text: 'En langage courant, comme vous le feriez avec un juriste.',
  },
  {
    title: 'JusticIA cherche l’article',
    text: 'Dans les codes, lois et décrets officiels de la République de Guinée.',
  },
  {
    title: 'Il cite, puis il explique',
    text: 'L’extrait exact, la référence, et une explication en langage clair.',
  },
];

const FLOW_QUESTION = 'Quel préavis pour un cadre ?';
const FLOW_CODES = ['Code civil', 'Code du travail', 'Code pénal', 'Code minier'];
const FLOW_HOLD = [2800, 2400, 3000];
const LIVE_HOLD = [1700, 2400, 1900, 2800];
const LIVE_STATUS = [
  'Question reçue',
  'Parcours des textes officiels…',
  'Art. 172.23 — Code du travail, 2014',
  'Réponse citée · trois mois',
];

const TOOLS = [
  {
    title: 'Questions sourcées',
    text: 'Chaque réponse indique la loi et l’article, avec un extrait du texte.',
  },
  {
    title: 'Dossiers et délais',
    text: 'Pièces, audiences et délais de recours, réunis par affaire.',
  },
  {
    title: 'Actes et contrats',
    text: 'Rédigés ou relus à partir du droit guinéen en vigueur.',
  },
  {
    title: 'Bibliothèque juridique',
    text: 'Codes, lois, décrets et Actes uniformes OHADA, consultables article par article.',
  },
];

const AUDIENCES = [
  { title: 'Avocats et juristes', text: 'L’article exact, les dossiers et les délais au même endroit.' },
  { title: 'Entreprises', text: 'Des décisions et des contrats appuyés sur le texte en vigueur.' },
  { title: 'Citoyens', text: 'Vos droits expliqués simplement, y compris en pular, malinké ou soussou.' },
  { title: 'Institutions', text: 'Des réponses homogènes et traçables pour les agents.' },
];

/**
 * Questions concrètes : chaque réponse et chaque extrait sont recopiés du texte officiel
 * (corpus vérifié, batterie de tests de bout en bout). Ne rien ajouter qui ne figure pas dans l'article.
 */
const EXAMPLES = [
  {
    domaine: 'Travail',
    q: 'Comment sont payées les heures supplémentaires\u00a0?',
    r: 'Avec une majoration de 30\u00a0% pour les quatre premières heures, puis de 60\u00a0% au-delà.',
    extrait: 'Cette majoration est de trente pour cent les quatre premières heures, de soixante pour cent au-delà.',
    ref: 'Code du travail · art. 221.6',
  },
  {
    domaine: 'Travail',
    q: 'Quelle est la durée légale du travail\u00a0?',
    r: 'Quarante heures par semaine dans les établissements privés.',
    extrait: 'La durée du travail effectif des salariés est habituellement de quarante heures par semaine.',
    ref: 'Code du travail · art. 221.1',
  },
  {
    domaine: 'Famille',
    q: 'À quel âge devient-on majeur\u00a0?',
    r: 'À 18 ans accomplis. On peut alors accomplir seul tous les actes de la vie civile.',
    extrait: 'La majorité est fixée à 18 ans accomplis ; à cet âge, on est capable de tous les actes de la vie civile.',
    ref: 'Code civil · art. 578',
  },
  {
    domaine: 'Succession',
    q: 'Quelle part de l’héritage revient aux héritiers réservataires\u00a0?',
    r: 'Les deux tiers de la succession. Le dernier tiers est la quotité disponible.',
    extrait: 'La réserve héréditaire globale est de 2/3 de la masse successorale […] ; le dernier tiers constitue la quotité disponible.',
    ref: 'Code civil · art. 710',
  },
  {
    domaine: 'Pénal',
    q: 'Quelle est la peine pour un vol simple\u00a0?',
    r: 'De 1 à 5 ans d’emprisonnement et une amende de 500\u00a0000 à 2\u00a0000\u00a0000\u00a0GNF, ou l’une de ces deux peines.',
    extrait: 'Le vol est puni d’un emprisonnement de 1 à 5 ans et d’une amende de 500.000 à 2.000.000 de francs guinéens ou de l’une de ces deux peines seulement.',
    ref: 'Code pénal · art. 373',
  },
  {
    domaine: 'Recouvrement',
    q: 'Combien de temps pour contester une injonction de payer\u00a0?',
    r: 'Dix jours à compter de la signification de l’ordonnance.',
    extrait: 'L’opposition doit être formée dans les dix jours qui suivent la signification de l’ordonnance portant injonction de payer.',
    ref: 'Acte uniforme OHADA (AUPSRVE) · art. 10',
  },
  {
    domaine: 'Sociétés',
    q: 'Quel capital minimum pour une société anonyme\u00a0?',
    r: 'Dix millions de francs CFA, selon l’Acte uniforme OHADA, qui prime sur le droit interne.',
    extrait: 'Le capital social minimum est fixé à dix millions (10.000.000) de francs CFA.',
    ref: 'Acte uniforme OHADA (AUSCGIE) · art. 387',
  },
  {
    domaine: 'Fiscalité',
    q: 'Quel est le taux normal de la TVA\u00a0?',
    r: '18\u00a0%. Certaines opérations, comme les exportations directes, sont taxées à 0\u00a0%.',
    extrait: 'Le taux de droit commun de la Taxe sur la Valeur Ajoutée est de dix-huit pourcent (18%).',
    ref: 'Code général des impôts · art. 373',
  },
];

/** Questions fréquentes : affichées sur la page et balisées pour les moteurs (FAQPage). */
const FAQ = [
  { q: "JusticIA remplace-t-il un avocat ?", a: "Non. JusticIA est un outil d’information juridique. Pour une procédure ou une décision importante, consultez un avocat inscrit au Barreau de Guinée." },
  { q: "D’où viennent les textes utilisés ?", a: "Des textes officiels de la République de Guinée : codes, lois et décrets publiés. Chaque réponse indique la loi et l’article cités, avec un extrait du texte." },
  { q: "Et si la réponse n’est pas dans les textes ?", a: "JusticIA vous l’indique explicitement. Il ne complète jamais une réponse par une disposition qui ne figure pas dans le corpus." },
  { q: "Les textes sont-ils à jour ?", a: "La base suit le Journal officiel : chaque nouveau numéro est relié aux textes qu’il publie. Un texte abrogé reste consultable mais il est signalé comme tel, et JusticIA ne s’appuie pas dessus pour répondre." },
  { q: "Et le droit des affaires OHADA ?", a: "Les Actes uniformes OHADA (sociétés, commerce, sûretés, recouvrement…) font partie de la base. Comme le prévoit le Traité OHADA, ils priment sur le droit interne contraire : JusticIA les cite en premier lorsqu’ils s’appliquent." },
  { q: "Que deviennent mes questions ?", a: "Vos conversations et vos dossiers sont stockés sur notre infrastructure et ne sont ni vendus ni utilisés pour entraîner un modèle d’IA. Pour rédiger la réponse, la question et les articles retrouvés sont transmis à un modèle de langage hébergé par notre fournisseur. Le mode éphémère permet de ne rien conserver." },
];

/** Textes affichés en orbite autour de la question. */
const ORBIT = [
  { abbr: 'CP',  label: 'Code pénal' },
  { abbr: 'CC',  label: 'Code civil' },
  { abbr: 'CT',  label: 'Code du travail' },
  { abbr: 'Cst', label: 'Constitution' },
  { abbr: 'CPP', label: 'Procédure pénale' },
  { abbr: 'CM',  label: 'Code minier' },
  { abbr: 'CGI', label: 'Impôts' },
  { abbr: 'CF',  label: 'Foncier' },
];

/** Sommaire du corpus (nombre d’articles par texte, tel qu’affiché dans l’Encyclopédie). */
// Remplacé au chargement par les dix plus grands textes du corpus (noms et nombres d'articles réels)
const CORPUS = INITIAL_FIGURES.principaux_textes;

function clamp01(v: number) { return Math.min(1, Math.max(0, v)); }

@Component({
  selector: 'app-accueil',
  imports: [RouterLink, Header, Footer, FormsModule, Reveal, GuineaMap],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, AfterViewInit, OnDestroy {
  readonly ledger = LEDGER.map(item => ({ ...item, shown: signal(item.value) }));
  readonly steps = STEPS;
  readonly tools = TOOLS;
  readonly audiences = AUDIENCES;
  readonly corpus = signal(CORPUS);
  readonly corpusMax = signal(Math.max(1, ...CORPUS.map(c => c.articles)));
  /** Chiffres réels du corpus (aucun contenu) : bibliothèque, jurisprudence, Journal officiel, OHADA. */
  readonly figures = signal<PublicFigures | null>(INITIAL_FIGURES);
  readonly orbitTiles = ORBIT;
  readonly examples = EXAMPLES;
  readonly faq = FAQ;

  @ViewChild('map') private map?: GuineaMap;
  @ViewChild('hx') private hxRef?: ElementRef<HTMLElement>;
  @ViewChild('orbit') private orbitRef?: ElementRef<HTMLElement>;
  private scrollRaf = 0;
  readonly flowCodes = FLOW_CODES;
  readonly flowStep = signal(0);
  readonly flowQuestion = signal(FLOW_QUESTION);
  readonly examplePlay = signal(false);
  readonly liveStep = signal(0);
  readonly liveScan = signal(-1);

  testimonials = signal<Testimonial[]>([]);
  partners = signal<Partner[]>([]);
  siteConfig = signal<SiteConfig | null>(null);

  contactForm = { name: '', email: '', subject: '', message: '', website: '' };
  /** Durée de remplissage du formulaire (anti-robots). */
  private readonly contactOpenedAt = Date.now();
  isSubmitting = signal(false);

  showToast = signal(false);
  toastSuccess = signal(true);
  toastText = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;
  private flowTimer: ReturnType<typeof setTimeout> | undefined;
  private typeTimer: ReturnType<typeof setTimeout> | undefined;
  private liveTimer: ReturnType<typeof setTimeout> | undefined;
  private liveScanTimer: ReturnType<typeof setTimeout> | undefined;
  private flowPaused = false;
  private livePaused = false;
  private liveStarted = false;
  private readonly motionOk =
    typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  private lib = inject(LibraryService);
  private seo = inject(SeoService);

  constructor(private contentService: ContentService, private http: HttpClient, private zone: NgZone) {}

  ngOnInit() {
    this.seo.setJsonLd('page-faq', faqJsonLd(FAQ));
    this.seo.setJsonLd('page-app', {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'JusticIA',
      url: SITE_URL + '/',
      applicationCategory: 'BusinessApplication',
      applicationSubCategory: 'Assistant juridique',
      operatingSystem: 'Web',
      inLanguage: 'fr',
      description: 'Assistant juridique qui retrouve l’article applicable dans les codes, lois, décrets et Actes uniformes OHADA de la République de Guinée, le cite mot pour mot et l’explique.',
      featureList: [
        'Réponses citant l’article exact du texte officiel',
        'Bibliothèque des codes et lois de Guinée, article par article',
        'Actes uniformes OHADA et jurisprudence',
        'Sommaires du Journal officiel',
        'Rédaction et relecture d’actes et de contrats',
        'Traduction en pular, malinké et soussou',
      ],
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'GNF', description: 'Compte gratuit, sans carte bancaire' },
      publisher: { '@id': SITE_URL + '/#organisation' },
    });
    this.lib.publicFigures().subscribe({
      next: (f) => {
        this.figures.set(f);
        this.ledger[0].value = f.textes_en_vigueur;
        this.ledger[1].value = f.articles;
        this.ledger.forEach(item => { if (item.shown() !== 0 || !this.motionOk) item.shown.set(item.value); });
        this.corpus.set(f.principaux_textes);
        this.corpusMax.set(Math.max(1, ...f.principaux_textes.map(c => c.articles)));
      },
    });
    this.contentService.getTestimonials().subscribe({ next: (data) => this.testimonials.set(data) });
    this.contentService.getPartners().subscribe({ next: (data) => this.partners.set(data) });
    this.contentService.getConfig().subscribe({ next: (data) => this.siteConfig.set(data) });
  }

  ngAfterViewInit() {
    if (typeof window === 'undefined') return;
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
    });
    this.applyScroll();
    if (!this.motionOk) {

      this.watchLive();
      return;
    }
    this.zone.run(() => {
      this.ledger.forEach(item => item.shown.set(0));
      this.flowQuestion.set('');
    });
    this.playExample();
    this.runCounters();
    this.startFlow();
    this.startLive();
  }

  ngOnDestroy() {
    if (typeof window === 'undefined') return; // pré-rendu : rien à observer ni animer
    if (this.toastTimer) clearTimeout(this.toastTimer);
    cancelAnimationFrame(this.scrollRaf);
    if (typeof window !== 'undefined') {
      window.removeEventListener('scroll', this.onScroll);
      window.removeEventListener('resize', this.onScroll);
    }
    this.stopFlow();
    this.stopLive();
  }

  /* ── Défilement : héros piloté + orbite ─────────────────────────── */
  private onScroll = () => {
    if (this.scrollRaf) return;
    this.scrollRaf = requestAnimationFrame(() => {
      this.scrollRaf = 0;
      this.applyScroll();
    });
  };

  private applyScroll() {
    const vh = window.innerHeight;
    // Héros : la carte s'incline doucement à mesure qu'on le quitte.
    const hx = this.hxRef?.nativeElement;
    if (hx) {
      const r = hx.getBoundingClientRect();
      this.map?.setProgress(clamp01(-r.top / Math.max(1, r.height)));
    }
    const orbit = this.orbitRef?.nativeElement;
    if (orbit) {
      const r = orbit.getBoundingClientRect();
      const q = (vh - r.top) / (vh + r.height);
      orbit.style.setProperty('--spin', `${(q * 140).toFixed(2)}deg`);
    }
  }

  pauseFlow() { this.flowPaused = true; }
  resumeFlow() { this.flowPaused = false; }
  pauseLive() { this.livePaused = true; }
  resumeLive() { this.livePaused = false; }

  liveStatus(): string {
    return LIVE_STATUS[this.liveStep()] ?? LIVE_STATUS[0];
  }

  private playExample() {
    this.zone.run(() => this.examplePlay.set(false));
    setTimeout(() => this.zone.run(() => this.examplePlay.set(true)), 40);
  }

  private runCounters() {
    const start = performance.now();
    const tick = () => {
      const k = Math.min(1, (performance.now() - start) / 1200);
      const ease = 1 - Math.pow(1 - k, 4);
      this.zone.run(() => this.ledger.forEach(item => item.shown.set(Math.round(item.value * ease))));
      if (k < 1) setTimeout(tick, 32);
    };
    tick();
  }

  private startFlow() {
    this.playStep(0);
  }

  private playStep(step: number) {
    this.zone.run(() => this.flowStep.set(step));
    if (step === 0) this.typeQuestion();
    this.flowTimer = setTimeout(() => this.advanceFrom(step), FLOW_HOLD[step]);
  }

  private advanceFrom(step: number) {
    if (this.flowPaused) {
      this.flowTimer = setTimeout(() => this.advanceFrom(step), 200);
      return;
    }
    this.playStep((step + 1) % 3);
  }

  private typeQuestion() {
    if (this.typeTimer) clearTimeout(this.typeTimer);
    this.zone.run(() => this.flowQuestion.set(''));
    let i = 0;
    const tick = () => {
      i += 1;
      this.zone.run(() => this.flowQuestion.set(FLOW_QUESTION.slice(0, i)));
      if (i < FLOW_QUESTION.length) this.typeTimer = setTimeout(tick, 38);
    };
    this.typeTimer = setTimeout(tick, 180);
  }

  private stopFlow() {
    if (this.flowTimer) clearTimeout(this.flowTimer);
    if (this.typeTimer) clearTimeout(this.typeTimer);
  }

  private watchLive() {
    this.zone.run(() => {
      this.liveStep.set(3);
      this.liveScan.set(1);
    });
  }

  private startLive() {
    if (this.liveStarted) return;
    this.liveStarted = true;
    this.playLive(0);
  }

  private playLive(step: number) {
    this.zone.run(() => this.liveStep.set(step));
    if (step === 1) this.runLiveScan();
    if (step === 0) this.zone.run(() => this.liveScan.set(-1));
    this.liveTimer = setTimeout(() => this.advanceLive(step), LIVE_HOLD[step]);
  }

  private advanceLive(step: number) {
    if (this.livePaused) {
      this.liveTimer = setTimeout(() => this.advanceLive(step), 200);
      return;
    }
    this.playLive((step + 1) % 4);
  }

  private runLiveScan() {
    if (this.liveScanTimer) clearTimeout(this.liveScanTimer);
    let i = 0;
    const tick = () => {
      this.zone.run(() => this.liveScan.set(i));
      i += 1;
      if (i < FLOW_CODES.length) {
        this.liveScanTimer = setTimeout(tick, 320);
        return;
      }
      this.zone.run(() => this.liveScan.set(1));
    };
    tick();
  }

  private stopLive() {
    if (this.liveTimer) clearTimeout(this.liveTimer);
    if (this.liveScanTimer) clearTimeout(this.liveScanTimer);
  }

  formatNumber(n: number): string { return n.toLocaleString('fr-FR'); }

  formatDate(iso: string): string {
    const d = new Date(iso + 'T12:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** « Journal Officiel N°12 (spécial) du 27 octobre 2026 » → « N°12 · spécial » (la date est affichée à part). */
  joLabel(n: { numero: string; special: boolean }): string {
    return `N°${n.numero}${n.special ? ' · spécial' : ''}`;
  }

  getContactEmails(): string[] {
    return this.siteConfig()?.contact?.emails ?? ['mosagix.contact@gmail.com'];
  }

  getContactPhones(): string[] {
    return this.siteConfig()?.contact?.phones ?? ['+224 627 24 30 90'];
  }

  getContactHours(): string {
    return this.siteConfig()?.contact?.hours ?? 'Lun-Ven, 9h-18h';
  }

  phoneHref(phone: string): string { return 'tel:' + phone.split(' ').join(''); }

  triggerToast(message: string, success: boolean) {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastText.set(message);
    this.toastSuccess.set(success);
    this.showToast.set(true);
    this.toastTimer = setTimeout(() => this.showToast.set(false), 5500);
  }

  closeToast() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.showToast.set(false);
  }

  submitContact() {
    if (!this.contactForm.name || !this.contactForm.email || !this.contactForm.subject || !this.contactForm.message) {
      this.triggerToast('Veuillez remplir tous les champs.', false);
      return;
    }

    this.isSubmitting.set(true);

    this.http.post(`${environment.apiUrl}/contact`, { ...this.contactForm, elapsed_ms: Date.now() - this.contactOpenedAt }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.contactForm = { name: '', email: '', subject: '', message: '', website: '' };
        this.triggerToast('Message envoyé. Nous vous répondons sous 24 heures ouvrées.', true);
      },
      error: (err) => {
        this.isSubmitting.set(false);
        this.triggerToast(err.error?.detail || "Erreur lors de l'envoi. Veuillez réessayer.", false);
      },
    });
  }
}

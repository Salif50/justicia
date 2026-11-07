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

// Valeurs remplacées au chargement par les chiffres réels du corpus (/public/corpus-figures)
const LEDGER = [
  { label: 'Textes en vigueur', value: 984 },
  { label: 'Articles indexés', value: 39815 },
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
    title: 'Encyclopédie',
    text: '33 textes officiels, consultables article par article.',
  },
];

const AUDIENCES = [
  { title: 'Avocats et juristes', text: 'L’article exact, les dossiers et les délais au même endroit.' },
  { title: 'Entreprises', text: 'Des décisions et des contrats appuyés sur le texte en vigueur.' },
  { title: 'Citoyens', text: 'Vos droits expliqués simplement, y compris en pular, malinké ou soussou.' },
  { title: 'Institutions', text: 'Des réponses homogènes et traçables pour les agents.' },
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
const CORPUS: { titre: string; annee: number | null; articles: number }[] = [];

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
  readonly corpusMax = signal(1);
  /** Chiffres réels du corpus (aucun contenu) : bibliothèque, jurisprudence, Journal officiel, OHADA. */
  readonly figures = signal<PublicFigures | null>(null);
  readonly orbitTiles = ORBIT;

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

  constructor(private contentService: ContentService, private http: HttpClient, private zone: NgZone) {}

  ngOnInit() {
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

import {
  AfterViewInit, Component, ElementRef, NgZone, OnDestroy, OnInit, ViewChild, signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { ContentService, Testimonial, Partner, SiteConfig } from '../../services/content';
import { environment } from '../../../environments/environment';
import { ChatSim } from './chat-sim/chat-sim';
import { ScrollStory } from './scroll-story/scroll-story';
import { Parallax, Reveal } from '../../core/reveal.directive';

// Titre du héros : chaque ligne apparaît par un masque (glissement vers le haut).
const TITLE_LINES: { text: string; em: boolean }[] = [
  { text: 'Le droit guinéen,',   em: false },
  { text: 'cité à la lettre.',   em: true  },
];

const MANIFESTO =
  "JusticIA ne répond jamais de mémoire. Il cherche l'article, le cite mot pour mot, puis l'explique. " +
  "Et quand le texte n'existe pas, il vous le dit.";
const MANIFESTO_EM = new Set(['mémoire.', 'mot', 'dit.']);

/** Sommaire du corpus (nombre d'articles par texte, tel qu'affiché dans l'Encyclopédie). */
const CORPUS = [
  { titre: 'Code des activités économiques', annee: 1994, articles: 2010 },
  { titre: 'Code civil',                     annee: 2019, articles: 1637 },
  { titre: 'Code de procédure pénale',       annee: 2016, articles: 1260 },
  { titre: 'Code pénal',                     annee: 2016, articles: 1011 },
  { titre: 'Code de procédure civile',       annee: 2018, articles: 915 },
  { titre: 'Code général des impôts',        annee: 2020, articles: 820 },
  { titre: 'Code du travail',                annee: 2014, articles: 464 },
  { titre: 'Code minier',                    annee: 2013, articles: 252 },
  { titre: 'Code foncier et domanial',       annee: 1992, articles: 241 },
  { titre: 'Constitution de la République',  annee: 2025, articles: 201 },
];

const MARQUEE = [
  'Constitution 2025', 'Code civil', 'Code pénal', 'Code du travail', 'Code de procédure pénale',
  'Code de procédure civile', 'Code général des impôts', 'Code minier', 'Code foncier et domanial',
  'Code électoral', 'Code des marchés publics', 'Code des activités économiques', 'Code de la sécurité sociale',
];

const LEDGER = [
  { label: 'Textes officiels',     value: 33 },
  { label: 'Articles indexés',     value: 12282 },
  { label: 'Domaines du droit',    value: 23 },
  { label: 'Réponses sans source', value: 0 },
];

const AUDIENCES = [
  {
    id: 'avocats', label: 'Avocats & juristes',
    question: "Quels sont les droits d'une personne placée en garde à vue ?",
    gains: ["L'article exact en quelques secondes", 'Dossiers, pièces et délais au même endroit', "Brouillons d'actes conformes au droit guinéen"],
  },
  {
    id: 'entreprises', label: 'Entreprises',
    question: 'Comment licencier un salarié sans risque de contentieux ?',
    gains: ["Décisions RH sécurisées, texte à l'appui", 'Contrats générés puis audités', 'Veille sur le droit du travail et fiscal'],
  },
  {
    id: 'citoyens', label: 'Citoyens',
    question: 'Quels sont mes droits en cas de divorce ?',
    gains: ['Vos droits expliqués simplement', 'Les démarches pas à pas', 'Traduction en Pular, Malinké ou Soussou'],
  },
  {
    id: 'institutions', label: 'Institutions',
    question: 'Quelle procédure pour un marché public de gré à gré ?',
    gains: ['Accès des agents aux textes en vigueur', 'Réponses homogènes et traçables', 'Formation et accompagnement dédiés'],
  },
];

@Component({
  selector: 'app-accueil',
  imports: [CommonModule, RouterLink, Header, Footer, FormsModule, ChatSim, ScrollStory, Reveal, Parallax],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('hero') hero?: ElementRef<HTMLElement>;
  @ViewChild('manifesto') manifesto?: ElementRef<HTMLElement>;
  @ViewChild('ledgerRef') ledgerEl?: ElementRef<HTMLElement>;
  @ViewChild('bento') bento?: ElementRef<HTMLElement>;

  readonly titleLines = TITLE_LINES;
  readonly titleText  = TITLE_LINES.map(l => l.text).join(' ');
  readonly corpus     = CORPUS;
  readonly marquee    = MARQUEE;
  readonly audiences  = AUDIENCES;
  readonly manifestoText = MANIFESTO;
  readonly manifestoWords = MANIFESTO.split(' ').map(w => ({ w, em: MANIFESTO_EM.has(w) }));

  readonly ledger = LEDGER.map(l => ({ ...l, shown: signal(l.value) }));
  readonly litWords = signal(MANIFESTO.split(' ').length);
  readonly marqueePaused = signal(false);
  readonly audience = signal(AUDIENCES[0]);

  // ── Données du site ─────────────────────────────────────────────────────
  testimonials = signal<Testimonial[]>([]);
  partners     = signal<Partner[]>([]);
  siteConfig   = signal<SiteConfig | null>(null);

  contactForm  = { name: '', email: '', subject: '', message: '', website: '' };
  /** Durée de remplissage du formulaire (anti-robots). */
  private readonly contactOpenedAt = Date.now();
  isSubmitting = signal(false);

  showToast    = signal(false);
  toastSuccess = signal(true);
  toastText    = signal('');
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  private readonly motionOk =
    typeof window !== 'undefined' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  private readonly finePointer =
    typeof window !== 'undefined' && !!window.matchMedia?.('(hover: hover) and (pointer: fine)').matches;
  private cleanups: (() => void)[] = [];

  constructor(private contentService: ContentService, private http: HttpClient, private zone: NgZone) {}

  ngOnInit() {
    this.contentService.getTestimonials().subscribe({ next: (data) => this.testimonials.set(data) });
    this.contentService.getPartners().subscribe({ next: (data) => this.partners.set(data) });
    this.contentService.getConfig().subscribe({ next: (data) => this.siteConfig.set(data) });
  }

  ngAfterViewInit() {
    if (typeof window === 'undefined' || !this.motionOk) return;
    this.zone.runOutsideAngular(() => {
      this.setupManifesto();
      this.setupCounters();
      this.setupTilt();
    });
  }

  ngOnDestroy() {
    this.cleanups.forEach(fn => fn());
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  // ── Effets ──────────────────────────────────────────────────────────────
  /** Les mots du manifeste s'encrent à mesure que la section traverse l'écran. */
  private setupManifesto() {
    const el = this.manifesto?.nativeElement;
    if (!el) return;
    const total = this.manifestoWords.length;
    this.zone.run(() => this.litWords.set(0));
    let raf = 0;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      const n = Math.round(p * total);
      if (n !== this.litWords()) this.zone.run(() => this.litWords.set(n));
    };
    const onScroll = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(measure); };
    window.addEventListener('scroll', onScroll, { passive: true });
    measure();
    this.cleanups.push(() => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); });
  }

  /** Compteurs qui défilent jusqu'à leur valeur réelle à l'apparition. */
  private setupCounters() {
    const el = this.ledgerEl?.nativeElement;
    if (!el || !('IntersectionObserver' in window)) return;
    this.zone.run(() => this.ledger.forEach(l => l.shown.set(0)));
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      io.disconnect();
      window.removeEventListener('scroll', check);
      const start = performance.now();
      const dur = 1400;
      const tick = (t: number) => {
        const k = Math.min(1, (t - start) / dur);
        const ease = 1 - Math.pow(1 - k, 4);
        this.zone.run(() => this.ledger.forEach(l => l.shown.set(Math.round(l.value * ease))));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) run();
    }, { threshold: 0.4 });
    io.observe(el);
    // Filet de sécurité si l'observateur ne se déclenche pas : vérification au défilement
    const check = () => {
      const r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.9 && r.bottom > 0) run();
    };
    window.addEventListener('scroll', check, { passive: true });
    setTimeout(check, 900);
    this.cleanups.push(() => { io.disconnect(); window.removeEventListener('scroll', check); });
  }

  /** Légère inclinaison des tuiles et reflet sous le pointeur. */
  private setupTilt() {
    const grid = this.bento?.nativeElement;
    if (!grid || !this.finePointer) return;
    const move = (e: PointerEvent) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.lp-tile');
      if (!tile) return;
      const r = tile.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      tile.style.setProperty('--rx', `${(0.5 - y) * 5}deg`);
      tile.style.setProperty('--ry', `${(x - 0.5) * 5}deg`);
      tile.style.setProperty('--gx', `${x * 100}%`);
      tile.style.setProperty('--gy', `${y * 100}%`);
    };
    const leave = (e: PointerEvent) => {
      const tile = (e.target as HTMLElement).closest<HTMLElement>('.lp-tile');
      tile?.style.setProperty('--rx', '0deg');
      tile?.style.setProperty('--ry', '0deg');
    };
    grid.addEventListener('pointermove', move);
    grid.addEventListener('pointerout', leave);
    this.cleanups.push(() => { grid.removeEventListener('pointermove', move); grid.removeEventListener('pointerout', leave); });
  }

  // ── Interactions ────────────────────────────────────────────────────────
  /** Navigation clavier entre les onglets « Pour qui » (flèches gauche/droite). */
  onAudienceKey(event: KeyboardEvent) {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const i = AUDIENCES.findIndex(a => a.id === this.audience().id);
    const next = (i + (event.key === 'ArrowRight' ? 1 : -1) + AUDIENCES.length) % AUDIENCES.length;
    this.audience.set(AUDIENCES[next]);
    const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLElement>('[role="tab"]');
    tabs?.[next]?.focus();
  }

  formatNumber(n: number): string { return n.toLocaleString('fr-FR'); }

  // ── Contact ─────────────────────────────────────────────────────────────
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

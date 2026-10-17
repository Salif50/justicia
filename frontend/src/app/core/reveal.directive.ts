import {
  AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy, Renderer2,
} from '@angular/core';

/** Un seul IntersectionObserver partagé par toutes les directives de la page. */
let sharedObserver: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, (entry: IntersectionObserverEntry) => void>();

function observer(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => entries.forEach((e) => callbacks.get(e.target)?.(e)),
      { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
    );
  }
  return sharedObserver;
}

/**
 * Filet de sécurité : si l'IntersectionObserver ne se déclenche pas (onglet masqué,
 * navigateur embarqué…), on vérifie la position au défilement et on révèle quand même.
 */
const pending = new Set<HTMLElement>();
let fallbackBound = false;
let fallbackRaf = 0;

function inViewport(el: HTMLElement): boolean {
  const r = el.getBoundingClientRect();
  const vh = window.innerHeight;
  return r.bottom > 0 && r.top < vh * 0.94;
}

function runFallback() {
  cancelAnimationFrame(fallbackRaf);
  fallbackRaf = requestAnimationFrame(() => {
    pending.forEach((el) => {
      if (!inViewport(el)) return;
      el.classList.add('is-in');
      pending.delete(el);
      sharedObserver?.unobserve(el);
      callbacks.delete(el);
    });
  });
}

function bindFallback() {
  if (fallbackBound) return;
  fallbackBound = true;
  window.addEventListener('scroll', runFallback, { passive: true });
  window.addEventListener('resize', runFallback, { passive: true });
}

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Apparition au défilement.
 *
 *   <section reveal>                       → monte en fondu
 *   <h2 reveal="left" [revealDelay]="120"> → glisse depuis la gauche, 120 ms après
 *   <ul reveal [revealStagger]="70">       → chaque enfant direct apparaît à 70 ms d'écart
 *
 * Styles dans styles.scss (.rv, .rv-stagger). Respecte prefers-reduced-motion
 * (état final immédiat) et ne fait rien côté serveur.
 */
@Directive({ selector: '[reveal]', standalone: true })
export class Reveal implements AfterViewInit, OnDestroy {
  /** Variante : '' | 'up' | 'left' | 'right' | 'scale' | 'blur' | 'fade' */
  @Input('reveal') variant: '' | 'up' | 'left' | 'right' | 'scale' | 'blur' | 'fade' = '';
  /** Délai supplémentaire en ms avant l'apparition. */
  @Input() revealDelay = 0;
  /** Si défini, échelonne les enfants directs de cet écart (ms). */
  @Input() revealStagger?: number | string;
  /** Durée en ms (défaut 900). */
  @Input() revealDuration?: number;

  private el: HTMLElement;

  constructor(ref: ElementRef<HTMLElement>, private r: Renderer2, private zone: NgZone) {
    this.el = ref.nativeElement;
  }

  ngAfterViewInit() {
    const el = this.el;
    const stagger = this.revealStagger !== undefined && this.revealStagger !== '' ? Number(this.revealStagger) : 0;

    if (stagger > 0) {
      this.r.addClass(el, 'rv-stagger');
      Array.from(el.children).forEach((child, i) => {
        this.r.addClass(child, 'rv-child');
        (child as HTMLElement).style.setProperty('--rv-delay', `${this.revealDelay + i * stagger}ms`);
      });
    } else {
      this.r.addClass(el, 'rv');
      if (this.variant && this.variant !== 'up') this.r.addClass(el, `rv-${this.variant}`);
      if (this.revealDelay) el.style.setProperty('--rv-delay', `${this.revealDelay}ms`);
      if (this.revealDuration) el.style.setProperty('--rv-dur', `${this.revealDuration}ms`);
    }

    if (typeof window === 'undefined' || reducedMotion() || !('IntersectionObserver' in window)) {
      this.r.addClass(el, 'is-in');
      return;
    }

    this.zone.runOutsideAngular(() => {
      callbacks.set(el, (entry) => {
        if (!entry.isIntersecting) return;
        this.r.addClass(el, 'is-in');
        observer().unobserve(el);
        callbacks.delete(el);
        pending.delete(el);
      });
      observer().observe(el);
      pending.add(el);
      bindFallback();
      // Déjà visible au chargement ? On révèle dès que la mise en page est stable.
      setTimeout(runFallback, 120);
      setTimeout(runFallback, 900);
    });
  }

  ngOnDestroy() {
    pending.delete(this.el);
    if (callbacks.has(this.el)) {
      sharedObserver?.unobserve(this.el);
      callbacks.delete(this.el);
    }
  }
}

/**
 * Parallaxe douce sur des calques décoratifs uniquement (jamais du texte).
 *
 *   <div class="blob" parallax="0.18"></div>   → se déplace à 18 % de la vitesse du défilement
 *   <div parallax="-0.1">                      → sens inverse
 *
 * Désactivée en mouvement réduit, sur écran tactile étroit (< 960 px) et côté serveur.
 */
@Directive({ selector: '[parallax]', standalone: true })
export class Parallax implements AfterViewInit, OnDestroy {
  @Input('parallax') speed: number | string = 0.15;

  private el: HTMLElement;
  private raf = 0;
  private active = false;
  /** Décalage actuellement appliqué (pour le retrancher de la mesure suivante). */
  private y = 0;
  private onScroll = () => {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.update());
  };

  constructor(ref: ElementRef<HTMLElement>, private zone: NgZone) {
    this.el = ref.nativeElement;
  }

  ngAfterViewInit() {
    if (typeof window === 'undefined' || reducedMotion()) return;
    if (!window.matchMedia('(min-width: 960px)').matches) return;
    this.active = true;
    this.el.classList.add('px');
    this.el.style.willChange = 'transform';
    this.zone.runOutsideAngular(() => {
      window.addEventListener('scroll', this.onScroll, { passive: true });
      window.addEventListener('resize', this.onScroll, { passive: true });
      this.update();
      // Nouvelle mesure une fois la mise en page stabilisée (polices, images, transitions de vue)
      setTimeout(this.onScroll, 300);
      setTimeout(this.onScroll, 1200);
    });
  }

  private update() {
    const r = this.el.getBoundingClientRect();
    // Position « au repos » du centre de l'élément (hors décalage déjà appliqué) par rapport au centre de l'écran
    const delta = (r.top - this.y + r.height / 2) - window.innerHeight / 2;
    this.y = -delta * Number(this.speed);
    // Exposé en variable CSS pour pouvoir se composer avec d'autres transformations (flottement…)
    this.el.style.setProperty('--py', `${this.y.toFixed(1)}px`);
  }

  ngOnDestroy() {
    if (!this.active) return;
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    cancelAnimationFrame(this.raf);
  }
}

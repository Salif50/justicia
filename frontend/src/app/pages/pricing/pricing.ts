import { Component, signal, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { ContentService, PricingPlan, FaqItem } from '../../services/content';

@Component({
  selector: 'app-tarif',
  imports: [CommonModule, RouterLink, Header, Footer],
  templateUrl: './pricing.html',
  styleUrl: './pricing.scss',
})
export class Pricing implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('scrollSection') scrollSections!: QueryList<ElementRef>;

  plans     = signal<PricingPlan[]>([]);
  faqItems  = signal<FaqItem[]>([]);
  isLoading = signal(true);

  private observer!: IntersectionObserver;

  constructor(private contentService: ContentService) {}

  ngOnInit() {
    this.observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.05, rootMargin: '0px 0px 0px 0px' }
    );

    this.contentService.getPricing().subscribe({
      next: (data) => {
        this.plans.set(data);
        this.isLoading.set(false);
        // Observer les cartes après rendu Angular
        setTimeout(() => this.observeAll(), 150);
      }
    });
    this.contentService.getFaq('pricing').subscribe({
      next: (data) => {
        this.faqItems.set(data);
        setTimeout(() => this.observeAll(), 150);
      }
    });
  }

  private observeAll() {
    document.querySelectorAll('.scroll-reveal').forEach((el) => this.observer.observe(el));
  }

  formatPrice(p: PricingPlan): string {
    if (p.price === '0') return 'Gratuit';
    if (!p.currency && !p.period) return p.price;
    return `${p.currency} ${Number(p.price).toLocaleString('fr-FR')}`;
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.scrollSections.forEach((s) => this.observer.observe(s.nativeElement));
      this.observeAll();
    }, 100);
  }

  ngOnDestroy() { if (this.observer) this.observer.disconnect(); }
}

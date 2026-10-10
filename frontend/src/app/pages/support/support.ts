import { Component, signal, OnInit, AfterViewInit, OnDestroy, ElementRef, ViewChildren, QueryList } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { ContentService, FaqItem, SiteConfig } from '../../services/content';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-support',
  imports: [CommonModule, RouterLink, Header, Footer, FormsModule],
  templateUrl: './support.html',
  styleUrl: './support.scss',
})
export class Support implements OnInit, AfterViewInit, OnDestroy {
  @ViewChildren('scrollSection') scrollSections!: QueryList<ElementRef>;

  faqItems   = signal<FaqItem[]>([]);
  siteConfig = signal<SiteConfig | null>(null);
  openFaqId  = signal<number | null>(null);

  // Formulaire de contact
  contactForm  = { name: '', email: '', subject: '', message: '' };
  isSubmitting = signal(false);

  // Toast
  showToast    = signal(false);
  toastSuccess = signal(true);
  toastText    = signal('');
  private toastTimer: any;

  private observer!: IntersectionObserver;

  constructor(private contentService: ContentService, private http: HttpClient) {}

  ngOnInit() {
    this.contentService.getFaq('support').subscribe({ next: (data) => this.faqItems.set(data) });
    this.contentService.getConfig().subscribe({ next: (data) => this.siteConfig.set(data) });

    this.observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add('is-visible'); }),
      { threshold: 0.1, rootMargin: '0px 0px -100px 0px' }
    );
  }

  toggleFaq(id: number) {
    this.openFaqId.set(this.openFaqId() === id ? null : id);
  }

  getContactEmails(): string[] {
    return this.siteConfig()?.contact?.emails ?? ['contact@justicia.gn', 'support@justicia.gn'];
  }

  getContactPhones(): string[] {
    return this.siteConfig()?.contact?.phones ?? ['+224 624 123 456', '+224 655 789 012'];
  }

  getContactHours(): string {
    return this.siteConfig()?.contact?.hours ?? 'Lun-Ven, 9h-18h';
  }

  phoneHref(phone: string): string {
    return 'tel:' + phone.split(' ').join('');
  }

  submitContact() {
    if (!this.contactForm.name || !this.contactForm.email || !this.contactForm.subject || !this.contactForm.message) {
      this.triggerToast('Veuillez remplir tous les champs.', false);
      return;
    }
    this.isSubmitting.set(true);
    this.http.post(`${environment.apiUrl}/contact`, this.contactForm).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.contactForm = { name: '', email: '', subject: '', message: '' };
        this.triggerToast('Message envoyé ! Nous vous répondrons sous 24h.', true);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.triggerToast("Erreur lors de l'envoi. Veuillez réessayer.", false);
      },
    });
  }

  ngAfterViewInit() {
    setTimeout(() => {
      this.scrollSections.forEach((s) => this.observer.observe(s.nativeElement));
      document.querySelectorAll('.scroll-reveal').forEach((el) => this.observer.observe(el));
    }, 100);
  }

  ngOnDestroy() {
    if (this.observer) this.observer.disconnect();
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

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
}

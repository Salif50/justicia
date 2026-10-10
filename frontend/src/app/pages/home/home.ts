import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Header } from '../../components/header/header';
import { Footer } from '../../components/footer/footer';
import { ContentService, Testimonial, Partner, SiteConfig } from '../../services/content';
import { environment } from '../../../environments/environment';

interface TitleChar { c: string; d: number; }
interface TitleLine { em: boolean; words: TitleChar[][]; }

// Révélation caractère par caractère du titre du hero.
const TITLE_LINES: { text: string; em: boolean }[] = [
  { text: 'Le droit guinéen,',      em: false },
  { text: 'répondu avec précision', em: true  },
  { text: "et sources à l'appui.",  em: false },
];
const TITLE_START_MS = 250;
const TITLE_STEP_MS  = 32;

function buildTitle(): TitleLine[] {
  let i = 0;
  return TITLE_LINES.map(line => ({
    em: line.em,
    words: line.text.split(' ').map(word =>
      [...word].map(c => ({ c, d: TITLE_START_MS + (i++) * TITLE_STEP_MS }))
    ),
  }));
}

@Component({
  selector: 'app-accueil',
  imports: [CommonModule, RouterLink, Header, Footer, FormsModule],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit, OnDestroy {
  readonly titleLines = buildTitle();
  readonly titleText  = TITLE_LINES.map(l => l.text).join(' ');

  testimonials = signal<Testimonial[]>([]);
  partners     = signal<Partner[]>([]);
  siteConfig   = signal<SiteConfig | null>(null);

  contactForm  = { name: '', email: '', subject: '', message: '' };
  isSubmitting = signal(false);

  showToast    = signal(false);
  toastSuccess = signal(true);
  toastText    = signal('');
  private toastTimer: any;

  constructor(private contentService: ContentService, private http: HttpClient) {}

  ngOnInit() {
    this.contentService.getTestimonials().subscribe({ next: (data) => this.testimonials.set(data) });
    this.contentService.getPartners().subscribe({ next: (data) => this.partners.set(data) });
    this.contentService.getConfig().subscribe({ next: (data) => this.siteConfig.set(data) });
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

  ngOnDestroy() {
    if (this.toastTimer) clearTimeout(this.toastTimer);
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
        this.triggerToast('Message envoyé avec succès. Nous vous répondrons dans les plus brefs délais.', true);
      },
      error: () => {
        this.isSubmitting.set(false);
        this.triggerToast("Erreur lors de l'envoi. Veuillez réessayer.", false);
      },
    });
  }
}

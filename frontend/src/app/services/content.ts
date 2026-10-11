import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Testimonial {
  id: number;
  name: string;
  role: string;
  text: string;
  rating: number;
  avatar_url: string | null;
  is_active: boolean;
  order: number;
}

export interface PricingPlan {
  id: number;
  plan_id?: string | null;
  name: string;
  price: string;
  currency: string;
  period: string;
  description: string;
  features: string[];
  /** Questions par jour pour les abonnés du plan (-1 = illimité). */
  daily_limit: number;
  is_popular: boolean;
  is_active: boolean;
  cta_text: string;
  cta_type: string;
  order: number;
}

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  category: string;
  order: number;
  is_active: boolean;
}

export interface Partner {
  id: number;
  name: string;
  logo_url: string | null;
  order: number;
  is_active: boolean;
}

export interface SiteConfig {
  stats: { documents: string; users: string; lawyers: string; support: string };
  contact: { emails: string[]; phones: string[]; hours: string; address: string };
  hero: { title: string; subtitle: string; badges: string[] };
  cta: { title: string; subtitle: string; trust: string[] };
  site: { name: string; copyright: string; description: string };
  [key: string]: any;
}

@Injectable({ providedIn: 'root' })
export class ContentService {
  private base = `${environment.apiUrl}/public`;

  constructor(private http: HttpClient) {}

  getTestimonials(): Observable<Testimonial[]> {
    return this.http.get<Testimonial[]>(`${this.base}/testimonials`);
  }

  getPricing(): Observable<PricingPlan[]> {
    return this.http.get<PricingPlan[]>(`${this.base}/pricing`);
  }

  getFaq(category?: string): Observable<FaqItem[]> {
    const params = category ? `?category=${category}` : '';
    return this.http.get<FaqItem[]>(`${this.base}/faq${params}`);
  }

  getPartners(): Observable<Partner[]> {
    return this.http.get<Partner[]>(`${this.base}/partners`);
  }

  getConfig(): Observable<SiteConfig> {
    return this.http.get<SiteConfig>(`${this.base}/config`);
  }
}

// ── Interfaces admin (CRUD) ───────────────────────────────────────────────────
export interface AdminContentService {} // voir admin.service.ts

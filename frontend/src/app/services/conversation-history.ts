import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from '../../environments/environment';
import { isAuthError } from '../core/utils/auth-error.util';

export interface ConversationHistory {
  id: string;
  title: string;
  messages: any[];
  createdAt: Date;
  updatedAt: Date;
  aiName: string;
  agent_id?: string;
  message_count?: number;
}

export interface UsageInfo {
  plan_id: string | null;
  plan_name: string;
  daily_limit: number;
  questions_today: number;
  remaining: number;
  is_unlimited: boolean;
  is_free_tier: boolean;
}

export interface PlanInfo {
  id: number;          // PK auto-increment
  plan_id: string | null; // slug ("basic", "pro", …) — lié à Subscription.plan_id
  name: string;
  description: string;
  price: string;       // "5000", "15000", "Sur mesure"
  currency: string;    // "FG"
  period: string;
  features: string[];
  daily_limit: number; // -1 = illimité
  is_popular: boolean;
  is_active: boolean;
  cta_text: string;
  cta_type: string;    // "link" | "contact"
  order: number;
}

export interface SubscriptionInfo {
  id: string;
  plan_id: string;
  name: string;
  price: number;
  period: string;
  features: string[];
  status: string;
  renewal_date: string | null;
  payment_method: string | null;
}

export interface InvoiceInfo {
  id: string;
  number: string | null;
  date: string;
  plan_name: string;
  description: string | null;
  amount: number;
  status: string;
}

export interface MosagixStatus {
  available: boolean;
  message: string | null;
  sandbox: boolean;
}

export interface MosagixCheckout {
  payment_id: string;
  merchant_reference: string;
  checkout_url: string;
  status: string;
  amount: number;
  currency: string;
}

export interface MosagixConfirmation {
  status: string;
  fulfilled: boolean;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ConversationHistoryService {
  private readonly api = environment.apiUrl;

  constructor(private http: HttpClient) {}

  // ── Conversations ──────────────────────────────────────────────────────────
  getHistory(): Observable<any[]> {
    return this.http.get<any[]>(`${this.api}/conversation/history`).pipe(
      catchError((err) => isAuthError(err) ? throwError(() => err) : of([]))
    );
  }

  getConversationById(id: string): Observable<any> {
    return this.http.get<any>(`${this.api}/conversation/${id}`);
  }

  deleteConversation(id: string): Observable<any> {
    return this.http.delete(`${this.api}/conversation/${id}`).pipe(
      catchError(() => of(null))
    );
  }

  sendMessage(message: string, agentId: string, conversationId?: string | null): Observable<any> {
    const body: any = { message, agent_id: agentId };
    if (conversationId) body['conversation_id'] = conversationId;
    return this.http.post<any>(`${this.api}/conversation/send`, body);
  }

  // ── Abonnement & Quota ────────────────────────────────────────────────────
  getUsage(): Observable<UsageInfo | null> {
    return this.http.get<UsageInfo>(`${this.api}/subscription/usage`).pipe(
      catchError((err) => isAuthError(err) ? throwError(() => err) : of(null))
    );
  }

  getPlans(): Observable<PlanInfo[]> {
    return this.http.get<PlanInfo[]>(`${this.api}/subscription/plans`).pipe(
      catchError(() => of([]))
    );
  }

  getCurrentSubscription(): Observable<SubscriptionInfo | null> {
    return this.http.get<SubscriptionInfo | null>(`${this.api}/subscription/current`).pipe(
      catchError(() => of(null))
    );
  }

  getInvoices(): Observable<InvoiceInfo[]> {
    return this.http.get<InvoiceInfo[]>(`${this.api}/subscription/invoices`).pipe(
      catchError(() => of([]))
    );
  }

  /** Facture PDF (fichier généré par le serveur, jamais stocké côté client). */
  downloadInvoicePdf(id: string): Observable<Blob> {
    return this.http.get(`${this.api}/subscription/invoices/${encodeURIComponent(id)}/pdf`, { responseType: 'blob' });
  }

  getPaymentStatus(): Observable<MosagixStatus> {
    return this.http.get<MosagixStatus>(`${this.api}/billing/status`);
  }

  createMosagixCheckout(planId: string, payerNumber: string): Observable<MosagixCheckout> {
    return this.http.post<MosagixCheckout>(`${this.api}/billing/checkout`, {
      plan_id: planId,
      payer_number: payerNumber,
    });
  }

  confirmMosagixPayment(paymentId: string): Observable<MosagixConfirmation> {
    return this.http.post<MosagixConfirmation>(`${this.api}/billing/confirm`, {
      payment_id: paymentId,
    });
  }

  cancelSubscription(): Observable<any> {
    return this.http.post(`${this.api}/subscription/cancel`, {}).pipe(
      catchError(() => of(null))
    );
  }

  // ── Profil utilisateur ────────────────────────────────────────────────────
  getUserProfile(): Observable<any> {
    return this.http.get<any>(`${this.api}/user/profile`).pipe(
      catchError((err) => isAuthError(err) ? throwError(() => err) : of(null))
    );
  }

  updateUserProfile(data: any): Observable<any> {
    return this.http.put<any>(`${this.api}/user/profile`, data);
  }

  changePassword(currentPassword: string, newPassword: string): Observable<any> {
    return this.http.post<any>(`${this.api}/user/change-password`, {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }

  // ── Préférences ───────────────────────────────────────────────────────────
  getPreferences(): Observable<any> {
    return this.http.get<any>(`${this.api}/user/preferences`).pipe(
      catchError(() => of(null))
    );
  }

  updatePreferences(prefs: Partial<{
    save_conversations: boolean;
    enable_notifications: boolean;
    auto_save_chat: boolean;
    theme: string;
    compact_mode: boolean;
    session_timeout: number;
    two_factor_auth: boolean;
    email_notifications: boolean;
    push_notifications: boolean;
    share_analytics: boolean;
    show_online_status: boolean;
    newsletter: boolean;
    ephemeral_mode: boolean;
  }>): Observable<any> {
    return this.http.put<any>(`${this.api}/user/preferences`, prefs);
  }

  // ── Actions RGPD ─────────────────────────────────────────────────────────
  deleteAllConversations(): Observable<any> {
    return this.http.delete<any>(`${this.api}/user/conversations`);
  }
}

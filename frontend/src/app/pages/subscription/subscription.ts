import { Component, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ConversationHistoryService,
  InvoiceInfo,
  PlanInfo,
  SubscriptionInfo,
  UsageInfo,
} from '../../services/conversation-history';

@Component({
  selector: 'app-abonnement',
  imports: [CommonModule, DatePipe, FormsModule],
  templateUrl: './subscription.html',
  styleUrl: './subscription.scss',
})
export class Subscription implements OnInit {
  currentSubscription = signal<SubscriptionInfo | null>(null);
  availablePlans      = signal<PlanInfo[]>([]);
  invoices            = signal<InvoiceInfo[]>([]);
  usage               = signal<UsageInfo | null>(null);

  isLoading      = signal(true);
  isUpgrading    = signal(false);
  isCancelling   = signal(false);
  upgradeSuccess = signal('');
  upgradeError   = signal('');
  showCancelConfirm = signal(false);
  showPaymentModal  = signal(false);
  selectedPlan      = signal<PlanInfo | null>(null);
  payerNumber       = '';
  paymentAvailable  = signal(false);
  paymentStatusMessage = signal('Vérification de Mosagix Pay…');
  paymentSandbox    = signal(false);

  constructor(private svc: ConversationHistoryService) {}

  ngOnInit() {
    this.loadAll();
    this.checkPaymentAvailability();
    this.svc.getUserProfile().subscribe(profile => {
      if (profile?.phone) this.payerNumber = this.normalizePhone(profile.phone);
    });
  }

  loadAll() {
    this.isLoading.set(true);

    this.svc.getCurrentSubscription().subscribe(sub => {
      this.currentSubscription.set(sub);
    });

    this.svc.getPlans().subscribe(plans => {
      this.availablePlans.set(plans);
    });

    this.svc.getInvoices().subscribe(inv => {
      this.invoices.set(inv);
    });

    this.svc.getUsage().subscribe(usage => {
      this.usage.set(usage);
      this.isLoading.set(false);
    });
  }

  checkPaymentAvailability(openAfterCheck = false) {
    this.svc.getPaymentStatus().subscribe({
      next: status => {
        this.paymentAvailable.set(status.available);
        this.paymentSandbox.set(status.sandbox);
        this.paymentStatusMessage.set(
          status.available ? 'Mosagix Pay est disponible' : (status.message || 'Paiements temporairement indisponibles'),
        );
        if (openAfterCheck && status.available) this.showPaymentModal.set(true);
      },
      error: err => {
        this.paymentAvailable.set(false);
        this.paymentStatusMessage.set(this.errorMessage(err, 'Mosagix Pay est momentanément indisponible.'));
      },
    });
  }

  selectPlan(plan: PlanInfo) {
    if (!plan.plan_id || this.isUpgrading()) return;
    this.upgradeSuccess.set('');
    this.upgradeError.set('');
    this.selectedPlan.set(plan);
    if (this.paymentAvailable()) {
      this.showPaymentModal.set(true);
    } else {
      this.checkPaymentAvailability(true);
    }
  }

  startPayment() {
    const plan = this.selectedPlan();
    if (!plan?.plan_id || this.isUpgrading()) return;
    const number = this.normalizePhone(this.payerNumber);
    if (!/^00\d{8,15}$/.test(number)) {
      this.upgradeError.set('Saisissez le numéro au format international, par exemple 00224623707722.');
      return;
    }

    this.payerNumber = number;
    this.upgradeError.set('');
    this.isUpgrading.set(true);
    this.svc.createMosagixCheckout(plan.plan_id, number).subscribe({
      next: checkout => {
        if (!checkout.checkout_url) {
          this.isUpgrading.set(false);
          this.upgradeError.set("Mosagix Pay n'a pas retourné de page de paiement.");
          return;
        }
        window.location.assign(checkout.checkout_url);
      },
      error: (err) => {
        this.isUpgrading.set(false);
        this.upgradeError.set(this.errorMessage(err, "Le paiement n'a pas pu être initialisé."));
      },
    });
  }

  closePaymentModal() {
    if (this.isUpgrading()) return;
    this.showPaymentModal.set(false);
    this.selectedPlan.set(null);
    this.upgradeError.set('');
  }

  confirmCancel() {
    this.showCancelConfirm.set(true);
  }

  cancelSubscription() {
    this.showCancelConfirm.set(false);
    this.isCancelling.set(true);

    this.svc.cancelSubscription().subscribe({
      next: () => {
        this.isCancelling.set(false);
        this.currentSubscription.set(null);
        this.svc.getUsage().subscribe(u => this.usage.set(u));
      },
      error: () => {
        this.isCancelling.set(false);
      },
    });
  }

  showUpgradeOptions() {
    document.querySelector('.plans-section')?.scrollIntoView({ behavior: 'smooth' });
  }

  getQuotaPercent(): number {
    const u = this.usage();
    if (!u || u.is_unlimited) return 0;
    return Math.min(100, Math.round((u.questions_today / u.daily_limit) * 100));
  }

  getQuotaColor(): string {
    const p = this.getQuotaPercent();
    if (p >= 100) return '#ef4444';
    if (p >= 80)  return '#f59e0b';
    return '#22c55e';
  }

  isCurrentPlan(planId: string | null): boolean {
    if (!planId) return false;
    return this.currentSubscription()?.plan_id === planId;
  }

  formatPrice(plan: import('../../services/conversation-history').PlanInfo): string {
    const n = Number(plan.price);
    if (isNaN(n)) return plan.price; // "Sur mesure"
    return new Intl.NumberFormat('fr-GN').format(n) + (plan.currency ? ' ' + plan.currency : '');
  }

  freeLimitLabel(): string {
    const u = this.usage();
    if (u && !u.is_unlimited) return `${u.daily_limit}`;
    return '5';
  }

  private normalizePhone(value: string): string {
    const raw = String(value || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (raw.startsWith('+')) return `00${digits}`;
    if (digits.startsWith('00')) return digits;
    if (digits.startsWith('224')) return `00${digits}`;
    if (digits.length === 9) return `00224${digits}`;
    return digits;
  }

  private errorMessage(err: any, fallback: string): string {
    const detail = err?.error?.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail.message === 'string') return detail.message;
    return fallback;
  }
}

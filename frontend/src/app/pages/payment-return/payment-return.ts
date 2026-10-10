import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ConversationHistoryService } from '../../services/conversation-history';

type ReturnState = 'confirming' | 'success' | 'pending' | 'failed' | 'cancelled' | 'invalid';

@Component({
  selector: 'app-payment-return',
  imports: [CommonModule, RouterLink],
  templateUrl: './payment-return.html',
  styleUrl: './payment-return.scss',
})
export class PaymentReturn implements OnInit, OnDestroy {
  state = signal<ReturnState>('confirming');
  message = signal('Vérification sécurisée de votre paiement…');
  paymentId = '';
  amount = '';
  currency = 'GNF';
  private attempts = 0;
  private retryTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private route: ActivatedRoute,
    private svc: ConversationHistoryService,
  ) {}

  ngOnInit() {
    const mode = this.route.snapshot.data['paymentOutcome'] as 'success' | 'cancel';
    const params = this.route.snapshot.queryParamMap;
    // La référence marchande existe localement avant l'appel Mosagix et reste
    // donc le meilleur identifiant de réconciliation en cas de timeout réseau.
    this.paymentId = params.get('mosagix_ref') || params.get('mosagix_payment_id') || '';
    this.amount = params.get('paid_amount') || params.get('amount') || '';
    this.currency = params.get('currency') || 'GNF';

    if (mode === 'cancel') {
      this.state.set('cancelled');
      this.message.set("Le paiement a été annulé. Aucun abonnement n'a été activé.");
      return;
    }
    if (!this.paymentId) {
      this.state.set('invalid');
      this.message.set("L'identifiant Mosagix est absent de l'URL de retour.");
      return;
    }
    this.confirm();
  }

  ngOnDestroy() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
  }

  retry() {
    this.attempts = 0;
    this.state.set('confirming');
    this.message.set('Nouvelle vérification du paiement…');
    this.confirm();
  }

  private confirm() {
    this.attempts += 1;
    this.svc.confirmMosagixPayment(this.paymentId).subscribe({
      next: result => {
        if (result.fulfilled) {
          this.state.set('success');
          this.message.set(result.message);
          return;
        }
        if (['failed', 'cancelled', 'timeout'].includes(result.status)) {
          this.state.set('failed');
          this.message.set(result.message);
          return;
        }
        if (this.attempts < 5) {
          this.state.set('confirming');
          this.message.set('Paiement reçu, confirmation Mosagix en cours…');
          this.retryTimer = setTimeout(() => this.confirm(), 2000);
        } else {
          this.state.set('pending');
          this.message.set("La confirmation prend plus de temps que prévu. Votre abonnement sera activé automatiquement dès réception du webhook.");
        }
      },
      error: err => {
        const detail = err?.error?.detail;
        this.state.set('pending');
        this.message.set(
          typeof detail === 'string'
            ? detail
            : detail?.message || "Nous n'avons pas encore pu confirmer le paiement. Vous pouvez réessayer sans repayer.",
        );
      },
    });
  }
}

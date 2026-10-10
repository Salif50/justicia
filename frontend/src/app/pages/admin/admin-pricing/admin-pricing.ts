import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { PricingPlan } from '../../../services/content';

@Component({
  selector: 'app-admin-pricing',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-pricing.html',
  styleUrl: './admin-pricing.scss',
})
export class AdminPricing implements OnInit {
  plans     = signal<PricingPlan[]>([]);
  isLoading = signal(true);
  showForm  = signal(false);
  editingId = signal<number | null>(null);
  error     = signal('');
  success   = signal('');

  form = {
    name: '', price: '', currency: 'FG', period: 'mois',
    description: '', featuresText: '', is_popular: false,
    is_active: true, cta_text: 'Choisir ce plan', cta_type: 'link', order: 0,
  };

  private base = `${environment.apiUrl}/admin/pricing`;

  constructor(private http: HttpClient) {}

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.http.get<PricingPlan[]>(this.base).subscribe({
      next: (data) => { this.plans.set(data); this.isLoading.set(false); },
      error: () => { this.error.set('Erreur de chargement.'); this.isLoading.set(false); },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form = { name: '', price: '', currency: 'FG', period: 'mois', description: '', featuresText: '', is_popular: false, is_active: true, cta_text: 'Choisir ce plan', cta_type: 'link', order: this.plans().length + 1 };
    this.showForm.set(true);
  }

  openEdit(p: PricingPlan) {
    this.editingId.set(p.id);
    this.form = { name: p.name, price: p.price, currency: p.currency, period: p.period, description: p.description, featuresText: p.features.join('\n'), is_popular: p.is_popular, is_active: p.is_active, cta_text: p.cta_text, cta_type: p.cta_type, order: p.order };
    this.showForm.set(true);
  }

  save() {
    this.error.set(''); this.success.set('');
    const features = this.form.featuresText.split('\n').map(f => f.trim()).filter(Boolean);
    const { featuresText, ...rest } = this.form;
    const body = { ...rest, features };
    const id = this.editingId();
    const req = id ? this.http.put(`${this.base}/${id}`, body) : this.http.post(this.base, body);

    req.subscribe({
      next: () => { this.success.set(id ? 'Plan modifié.' : 'Plan ajouté.'); this.showForm.set(false); this.load(); },
      error: () => this.error.set('Erreur lors de la sauvegarde.'),
    });
  }

  toggleActive(p: PricingPlan) {
    this.http.put(`${this.base}/${p.id}`, { is_active: !p.is_active }).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Erreur.'),
    });
  }

  delete(p: PricingPlan) {
    if (!confirm(`Supprimer le plan "${p.name}" ?`)) return;
    this.http.delete(`${this.base}/${p.id}`).subscribe({
      next: () => { this.success.set('Plan supprimé.'); this.load(); },
      error: () => this.error.set('Erreur lors de la suppression.'),
    });
  }

  cancel() { this.showForm.set(false); this.error.set(''); }

  formatPrice(p: PricingPlan): string {
    if (!p.currency && !p.period) return p.price;
    if (p.price === '0') return 'Gratuit';
    return `${p.currency} ${Number(p.price).toLocaleString('fr-FR')} / ${p.period}`;
  }
}

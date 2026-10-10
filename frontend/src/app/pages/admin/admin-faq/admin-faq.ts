import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { FaqItem } from '../../../services/content';

@Component({
  selector: 'app-admin-faq',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-faq.html',
  styleUrl: './admin-faq.scss',
})
export class AdminFaq implements OnInit {
  items       = signal<FaqItem[]>([]);
  isLoading   = signal(true);
  showForm    = signal(false);
  editingId   = signal<number | null>(null);
  filterCat   = signal('');
  error       = signal('');
  success     = signal('');

  form = { question: '', answer: '', category: 'support', order: 0, is_active: true };

  categories = [
    { value: '', label: 'Toutes' },
    { value: 'support', label: 'Support' },
    { value: 'pricing', label: 'Tarifs' },
    { value: 'general', label: 'Général' },
  ];

  private base = `${environment.apiUrl}/admin/faq`;

  constructor(private http: HttpClient) {}

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    const cat = this.filterCat();
    const url = cat ? `${this.base}?category=${cat}` : this.base;
    this.http.get<FaqItem[]>(url).subscribe({
      next: (data) => { this.items.set(data); this.isLoading.set(false); },
      error: () => { this.error.set('Erreur de chargement.'); this.isLoading.set(false); },
    });
  }

  setFilter(cat: string) { this.filterCat.set(cat); this.load(); }

  openCreate() {
    this.editingId.set(null);
    this.form = { question: '', answer: '', category: this.filterCat() || 'support', order: this.items().length + 1, is_active: true };
    this.showForm.set(true);
  }

  openEdit(f: FaqItem) {
    this.editingId.set(f.id);
    this.form = { question: f.question, answer: f.answer, category: f.category, order: f.order, is_active: f.is_active };
    this.showForm.set(true);
  }

  save() {
    this.error.set(''); this.success.set('');
    const id = this.editingId();
    const req = id
      ? this.http.put(`${this.base}/${id}`, this.form)
      : this.http.post(this.base, this.form);

    req.subscribe({
      next: () => { this.success.set(id ? 'FAQ modifiée.' : 'FAQ ajoutée.'); this.showForm.set(false); this.load(); },
      error: () => this.error.set('Erreur lors de la sauvegarde.'),
    });
  }

  toggleActive(f: FaqItem) {
    this.http.put(`${this.base}/${f.id}`, { is_active: !f.is_active }).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Erreur.'),
    });
  }

  delete(f: FaqItem) {
    if (!confirm('Supprimer cette question ?')) return;
    this.http.delete(`${this.base}/${f.id}`).subscribe({
      next: () => { this.success.set('Question supprimée.'); this.load(); },
      error: () => this.error.set('Erreur lors de la suppression.'),
    });
  }

  cancel() { this.showForm.set(false); this.error.set(''); }

  getCatLabel(cat: string): string {
    return this.categories.find(c => c.value === cat)?.label || cat;
  }
}

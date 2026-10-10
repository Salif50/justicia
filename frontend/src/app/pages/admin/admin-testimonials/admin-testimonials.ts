import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { Testimonial } from '../../../services/content';

@Component({
  selector: 'app-admin-testimonials',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-testimonials.html',
  styleUrl: './admin-testimonials.scss',
})
export class AdminTestimonials implements OnInit {
  testimonials = signal<Testimonial[]>([]);
  isLoading    = signal(true);
  showForm     = signal(false);
  editingId    = signal<number | null>(null);
  error        = signal('');
  success      = signal('');

  form = {
    name: '', role: '', text: '', rating: 5,
    avatar_url: '', is_active: true, order: 0,
  };

  private base = `${environment.apiUrl}/admin/testimonials`;

  constructor(private http: HttpClient) {}

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.http.get<Testimonial[]>(this.base).subscribe({
      next: (data) => { this.testimonials.set(data); this.isLoading.set(false); },
      error: () => { this.error.set('Erreur de chargement.'); this.isLoading.set(false); },
    });
  }

  openCreate() {
    this.editingId.set(null);
    this.form = { name: '', role: '', text: '', rating: 5, avatar_url: '', is_active: true, order: this.testimonials().length + 1 };
    this.showForm.set(true);
  }

  openEdit(t: Testimonial) {
    this.editingId.set(t.id);
    this.form = { name: t.name, role: t.role, text: t.text, rating: t.rating, avatar_url: t.avatar_url || '', is_active: t.is_active, order: t.order };
    this.showForm.set(true);
  }

  save() {
    this.error.set(''); this.success.set('');
    const body = { ...this.form, avatar_url: this.form.avatar_url || null };
    const id = this.editingId();
    const req = id
      ? this.http.put(`${this.base}/${id}`, body)
      : this.http.post(this.base, body);

    req.subscribe({
      next: () => { this.success.set(id ? 'Témoignage modifié.' : 'Témoignage ajouté.'); this.showForm.set(false); this.load(); },
      error: () => this.error.set('Erreur lors de la sauvegarde.'),
    });
  }

  toggleActive(t: Testimonial) {
    this.http.put(`${this.base}/${t.id}`, { is_active: !t.is_active }).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Erreur.'),
    });
  }

  delete(t: Testimonial) {
    if (!confirm(`Supprimer le témoignage de ${t.name} ?`)) return;
    this.http.delete(`${this.base}/${t.id}`).subscribe({
      next: () => { this.success.set('Témoignage supprimé.'); this.load(); },
      error: () => this.error.set('Erreur lors de la suppression.'),
    });
  }

  cancel() { this.showForm.set(false); this.error.set(''); }

  stars(n: number) { return Array(n).fill(0); }
}

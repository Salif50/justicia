import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface ConfigSection {
  key: string;
  label: string;
  value: any;
}

@Component({
  selector: 'app-admin-config',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-config.html',
  styleUrl: './admin-config.scss',
})
export class AdminConfig implements OnInit {
  sections  = signal<ConfigSection[]>([]);
  isLoading = signal(true);
  saving    = signal<string | null>(null);
  error     = signal('');
  success   = signal('');

  // Données éditables localement avant sauvegarde
  forms: Record<string, any> = {};

  private base = `${environment.apiUrl}/admin/config`;

  constructor(private http: HttpClient) {}

  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.http.get<ConfigSection[]>(this.base).subscribe({
      next: (data) => {
        this.sections.set(data);
        // Initialiser les formulaires avec les valeurs actuelles
        data.forEach(s => {
          this.forms[s.key] = JSON.parse(JSON.stringify(s.value)); // deep copy
        });
        this.isLoading.set(false);
      },
      error: () => { this.error.set('Erreur de chargement.'); this.isLoading.set(false); },
    });
  }

  save(key: string) {
    this.error.set(''); this.success.set('');
    this.saving.set(key);
    this.http.put(`${this.base}/${key}`, { value: this.forms[key] }).subscribe({
      next: () => { this.success.set('Configuration sauvegardée.'); this.saving.set(null); this.load(); },
      error: () => { this.error.set('Erreur lors de la sauvegarde.'); this.saving.set(null); },
    });
  }

  // Helpers pour les tableaux JSON (emails, phones, badges...)
  addItem(arr: string[], value: string = '') { arr.push(value); }
  removeItem(arr: string[], index: number) { arr.splice(index, 1); }
  trackByIndex(index: number) { return index; }
}

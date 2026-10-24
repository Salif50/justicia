import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CaseService, CaseOut } from '../../services/case.service';
import { ClientRecord, ClientService } from '../../services/client.service';

@Component({
  selector: 'app-cases',
  imports: [CommonModule, FormsModule],
  templateUrl: './cases.html',
  styleUrl: './cases.scss',
})
export class Cases implements OnInit {
  cases      = signal<CaseOut[]>([]);
  isLoading  = signal(true);
  showModal  = signal(false);
  isCreating = signal(false);
  createError = signal('');
  clients = signal<ClientRecord[]>([]);
  newClientId = signal('');

  newName        = signal('');
  newDescription = signal('');

  constructor(private svc: CaseService, private clientService: ClientService, private router: Router) {}

  ngOnInit() {
    this.load();
    this.clientService.list().subscribe(list => this.clients.set(list));
  }

  load() {
    this.isLoading.set(true);
    this.svc.list().subscribe(list => {
      this.cases.set(list);
      this.isLoading.set(false);
    });
  }

  openModal() {
    this.newName.set('');
    this.newDescription.set('');
    this.newClientId.set('');
    this.createError.set('');
    this.showModal.set(true);
  }

  closeModal() {
    this.showModal.set(false);
  }

  create() {
    const name = this.newName().trim();
    if (!name) { this.createError.set('Le nom du procès est obligatoire.'); return; }
    this.isCreating.set(true);
    this.createError.set('');
    this.svc.create(name, this.newDescription().trim(), this.newClientId()).subscribe({
      next: (c) => {
        this.isCreating.set(false);
        this.showModal.set(false);
        this.router.navigate(['/dashboard/cases', c.id]);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.createError.set(err.error?.detail || 'Une erreur est survenue.');
      },
    });
  }

  openCase(id: string) {
    this.router.navigate(['/dashboard/cases', id]);
  }

  formatDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }
}

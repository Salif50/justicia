import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ClientPayload, ClientRecord, ClientService } from '../../services/client.service';

@Component({ selector: 'app-clients', imports: [CommonModule, FormsModule], templateUrl: './clients.html', styleUrl: './clients.scss' })
export class Clients implements OnInit {
  clients = signal<ClientRecord[]>([]); loading = signal(true); error = signal(''); query = ''; showModal = signal(false); editing = signal<ClientRecord | null>(null); saving = signal(false);
  form: ClientPayload = this.empty();
  constructor(private service: ClientService) {}
  ngOnInit() { this.load(); }
  load() { this.loading.set(true); this.service.list(this.query).subscribe({ next: rows => { this.clients.set(rows); this.loading.set(false); }, error: () => { this.error.set('Impossible de charger les clients.'); this.loading.set(false); } }); }
  open(client?: ClientRecord) { this.editing.set(client || null); this.form = client ? { name: client.name, email: client.email, phone: client.phone, organization: client.organization, status: client.status, notes: client.notes } : this.empty(); this.showModal.set(true); }
  save() { if (!this.form.name.trim() || this.saving()) return; this.saving.set(true); const request = this.editing() ? this.service.update(this.editing()!.id, this.form) : this.service.create(this.form); request.subscribe({ next: () => { this.showModal.set(false); this.saving.set(false); this.load(); }, error: () => { this.error.set('Le client n’a pas pu être enregistré.'); this.saving.set(false); } }); }
  remove(client: ClientRecord) { if (!confirm(`Supprimer ${client.name} ?`)) return; this.service.delete(client.id).subscribe({ next: () => this.load(), error: () => this.error.set('Suppression impossible.') }); }
  private empty(): ClientPayload { return { name: '', email: '', phone: '', organization: '', status: 'active', notes: '' }; }
}

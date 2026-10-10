import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Contact {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}

@Component({
  selector: 'app-admin-contacts',
  imports: [CommonModule],
  templateUrl: './admin-contacts.html',
  styleUrl: './admin-contacts.scss',
})
export class AdminContacts implements OnInit {
  contacts      = signal<Contact[]>([]);
  isLoading     = signal(true);
  error         = signal('');
  success       = signal('');
  selectedContact = signal<Contact | null>(null);
  showUnreadOnly  = signal(false);

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadContacts(); }

  loadContacts() {
    this.isLoading.set(true);
    const url = this.showUnreadOnly()
      ? `${environment.apiUrl}/admin/contacts?unread_only=true`
      : `${environment.apiUrl}/admin/contacts`;

    this.http.get<Contact[]>(url).subscribe({
      next: (c) => { this.contacts.set(c); this.isLoading.set(false); },
      error: ()  => { this.error.set('Impossible de charger les messages.'); this.isLoading.set(false); },
    });
  }

  toggleFilter() {
    this.showUnreadOnly.update(v => !v);
    this.loadContacts();
  }

  openContact(contact: Contact) {
    this.selectedContact.set(contact);
    if (!contact.is_read) {
      this.markRead(contact);
    }
  }

  closeContact() {
    this.selectedContact.set(null);
    this.loadContacts();
  }

  markRead(contact: Contact) {
    this.http.put(`${environment.apiUrl}/admin/contacts/${contact.id}/read`, {}).subscribe({
      next: () => {
        this.contacts.update(list => list.map(c =>
          c.id === contact.id ? { ...c, is_read: true } : c
        ));
      },
      error: () => {},
    });
  }

  deleteContact(contact: Contact) {
    if (!confirm(`Supprimer le message de ${contact.name} ?`)) return;
    this.http.delete(`${environment.apiUrl}/admin/contacts/${contact.id}`).subscribe({
      next: () => {
        this.success.set('Message supprimé.');
        this.selectedContact.set(null);
        this.loadContacts();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: (err) => this.error.set(err.error?.detail || 'Erreur lors de la suppression.'),
    });
  }

  get unreadCount(): number {
    return this.contacts().filter(c => !c.is_read).length;
  }

  formatDate(d: string): string {
    return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(d));
  }

  avatarColor(name: string): string {
    const colors = ['#1565c0','#6a1b9a','#2e7d32','#c62828','#e65100','#00838f','#283593','#558b2f'];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return colors[Math.abs(hash) % colors.length];
  }
}

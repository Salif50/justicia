import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ConversationHistoryService } from '../../services/conversation-history';
import { FirmInvitation, FirmMember, FirmService } from '../../services/firm.service';

@Component({ selector: 'app-firm', imports: [CommonModule, FormsModule], templateUrl: './firm.html', styleUrl: './firm.scss' })
export class Firm implements OnInit {
  organization = signal(''); barNumber = signal(''); city = signal(''); profession = signal(''); bio = signal(''); loading = signal(true); saving = signal(false); message = signal(''); error = signal('');
  invitations = signal<FirmInvitation[]>([]); inviteEmail = ''; inviteRole = 'member'; inviteError = signal(''); inviting = signal(false);
  members = signal<FirmMember[]>([]);
  constructor(private service: ConversationHistoryService, private firm: FirmService) {}
  ngOnInit() { this.service.getUserProfile().subscribe({ next: p => { if (p) { this.organization.set(p.organization || ''); this.barNumber.set(p.bar_number || ''); this.city.set(p.city || ''); this.profession.set(p.profession || ''); this.bio.set(p.bio || ''); } this.loading.set(false); }, error: () => this.loading.set(false) }); this.loadInvitations(); }
  loadInvitations() { this.firm.list().subscribe({ next: rows => this.invitations.set(rows), error: () => {} }); this.firm.members().subscribe({ next: rows => this.members.set(rows), error: () => {} }); }
  save() { this.saving.set(true); this.message.set(''); this.error.set(''); this.service.updateUserProfile({ organization: this.organization() || undefined, bar_number: this.barNumber() || undefined, city: this.city() || undefined, profession: this.profession() || undefined, bio: this.bio() || undefined }).subscribe({ next: () => { this.saving.set(false); this.message.set('Les informations du cabinet ont été enregistrées.'); }, error: () => { this.saving.set(false); this.error.set('Impossible d’enregistrer les informations.'); } }); }
  invite() { const email = this.inviteEmail.trim(); if (!email || this.inviting()) return; this.inviting.set(true); this.inviteError.set(''); this.firm.invite(email, this.inviteRole).subscribe({ next: row => { this.invitations.update(rows => [row, ...rows]); this.inviteEmail = ''; this.inviting.set(false); }, error: err => { this.inviteError.set(err.error?.detail || 'Invitation impossible.'); this.inviting.set(false); } }); }
  cancelInvite(row: FirmInvitation) { this.firm.cancel(row.id).subscribe({ next: () => this.invitations.update(rows => rows.filter(item => item.id !== row.id)) }); }
  removeMember(row: FirmMember) { if (!confirm(`Retirer ${row.name} du cabinet ?`)) return; this.firm.removeMember(row.id).subscribe({ next: () => this.members.update(rows => rows.filter(item => item.id !== row.id)) }); }
}

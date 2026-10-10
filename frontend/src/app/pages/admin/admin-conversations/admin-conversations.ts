import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AdminService, AdminConversation, AdminConversationDetail } from '../../../services/admin.service';

@Component({
  selector: 'app-admin-conversations',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-conversations.html',
  styleUrl: './admin-conversations.scss',
})
export class AdminConversations implements OnInit {
  private svc = inject(AdminService);

  conversations = signal<AdminConversation[]>([]);
  isLoading     = signal(true);
  totalConvs    = signal(0);
  messagesToday = signal(0);

  // Filters
  searchQuery = '';
  agentFilter = '';

  // Detail view
  selectedConv   = signal<AdminConversationDetail | null>(null);
  detailLoading  = signal(false);
  showDetail     = signal(false);

  // Pagination
  skip  = 0;
  limit = 50;

  readonly AGENTS = [
    { id: '', label: 'Tous les agents' },
    { id: 'jurisprudence', label: 'Jurisprudence' },
    { id: 'matrimonial',   label: 'Matrimonial' },
    { id: 'penal',         label: 'Pénal' },
    { id: 'commercial',    label: 'Commercial' },
    { id: 'travail',       label: 'Travail' },
    { id: 'immobilier',    label: 'Immobilier' },
  ];

  ngOnInit() {
    this.load();
    this.svc.getConversationCount().subscribe(c => {
      this.totalConvs.set(c.total_conversations);
      this.messagesToday.set(c.messages_today);
    });
  }

  load() {
    this.isLoading.set(true);
    this.svc.getConversations({
      skip: this.skip,
      limit: this.limit,
      agent_id: this.agentFilter || undefined,
      q: this.searchQuery || undefined,
    }).subscribe({
      next: convs => { this.conversations.set(convs); this.isLoading.set(false); },
      error: ()   => { this.isLoading.set(false); },
    });
  }

  applyFilters() {
    this.skip = 0;
    this.load();
  }

  nextPage() {
    this.skip += this.limit;
    this.load();
  }

  prevPage() {
    if (this.skip >= this.limit) { this.skip -= this.limit; this.load(); }
  }

  viewMessages(conv: AdminConversation) {
    this.detailLoading.set(true);
    this.showDetail.set(true);
    this.svc.getConversationMessages(conv.id).subscribe({
      next: detail => { this.selectedConv.set(detail); this.detailLoading.set(false); },
      error: ()    => { this.detailLoading.set(false); },
    });
  }

  closeDetail() {
    this.showDetail.set(false);
    this.selectedConv.set(null);
  }

  deleteConversation(conv: AdminConversation) {
    if (!confirm(`Supprimer la conversation "${conv.title}" de ${conv.user_email} ?`)) return;
    this.svc.deleteConversation(conv.id).subscribe(() => {
      this.conversations.update(list => list.filter(c => c.id !== conv.id));
      this.totalConvs.update(n => n - 1);
      if (this.selectedConv()?.id === conv.id) this.closeDetail();
    });
  }

  agentLabel(id: string): string {
    const found = this.AGENTS.find(a => a.id === id);
    return found?.label ?? id;
  }

  agentColor(id: string): string {
    const map: Record<string, string> = {
      jurisprudence: '#6c63ff', matrimonial: '#e91e8c', penal: '#f44336',
      commercial: '#ff9800', travail: '#4caf50', immobilier: '#2196f3',
    };
    return map[id] || '#888';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-GN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
}

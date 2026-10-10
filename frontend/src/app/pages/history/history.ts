import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ConversationHistoryService } from '../../services/conversation-history';

interface ConvSummary {
  id: string;
  title: string;
  agent_id: string;
  ai_name: string;
  message_count: number;
  created_at: string;
  updated_at: string;
}

@Component({
  selector: 'app-historique',
  imports: [CommonModule, RouterLink],
  templateUrl: './history.html',
  styleUrl: './history.scss',
})
export class History implements OnInit {
  conversations  = signal<ConvSummary[]>([]);
  isLoading      = signal(true);
  error          = signal('');
  isDeleting     = signal(false);

  // Modal de confirmation suppression
  showDeleteModal      = signal(false);
  deleteTargetId       = signal<string | null>(null);
  deleteTargetTitle    = signal('');

  // Modal de confirmation "tout supprimer"
  showDeleteAllModal   = signal(false);

  constructor(private historyService: ConversationHistoryService) {}

  ngOnInit() {
    this.loadHistory();
  }

  loadHistory() {
    this.isLoading.set(true);
    this.error.set('');
    this.historyService.getHistory().subscribe({
      next: (list: any[]) => {
        this.conversations.set(list);
        this.isLoading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger l\'historique.');
        this.isLoading.set(false);
      },
    });
  }

  // Ouvre le modal de confirmation pour une conversation
  askDelete(id: string, title: string, event: Event) {
    event.stopPropagation();
    this.deleteTargetId.set(id);
    this.deleteTargetTitle.set(title);
    this.showDeleteModal.set(true);
  }

  // Confirme la suppression d'une conversation
  confirmDelete() {
    const id = this.deleteTargetId();
    if (!id) return;
    this.isDeleting.set(true);
    this.historyService.deleteConversation(id).subscribe({
      next: () => {
        this.showDeleteModal.set(false);
        this.isDeleting.set(false);
        this.loadHistory();
      },
      error: () => {
        this.isDeleting.set(false);
        this.error.set('Erreur lors de la suppression.');
        this.showDeleteModal.set(false);
      },
    });
  }

  cancelDelete() {
    this.showDeleteModal.set(false);
    this.deleteTargetId.set(null);
  }

  // Tout supprimer
  askDeleteAll(event: Event) {
    event.stopPropagation();
    this.showDeleteAllModal.set(true);
  }

  confirmDeleteAll() {
    this.isDeleting.set(true);
    const ids = this.conversations().map(c => c.id);
    let done = 0;
    if (ids.length === 0) {
      this.showDeleteAllModal.set(false);
      this.isDeleting.set(false);
      return;
    }
    ids.forEach(id => {
      this.historyService.deleteConversation(id).subscribe({
        next: () => {
          done++;
          if (done === ids.length) {
            this.showDeleteAllModal.set(false);
            this.isDeleting.set(false);
            this.loadHistory();
          }
        },
        error: () => {
          done++;
          if (done === ids.length) {
            this.showDeleteAllModal.set(false);
            this.isDeleting.set(false);
            this.loadHistory();
          }
        },
      });
    });
  }

  cancelDeleteAll() {
    this.showDeleteAllModal.set(false);
  }

  formatDate(date: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(date));
  }

  getAgentLabel(agentId: string): string {
    const map: Record<string, string> = {
      jurisprudence: 'Jurisprudence',
      matrimonial:   'Matrimonial',
      penal:         'Pénal',
      commercial:    'Commercial',
      travail:       'Travail',
      immobilier:    'Immobilier',
    };
    return map[agentId] || 'JusticIA';
  }
}

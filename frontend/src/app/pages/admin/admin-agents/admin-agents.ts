import { Component, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

export interface BuiltinAgentConfig {
  agent_id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  domain_filter: string | null;
  system_prompt: string;
  is_db_override: boolean;
}

export interface AdminCustomAgent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  domains: string[];
  doc_count: number;
  user_name: string;
  user_email: string;
  created_at: string;
}

@Component({
  selector: 'app-admin-agents',
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-agents.html',
  styleUrl: './admin-agents.scss',
})
export class AdminAgents implements OnInit {
  private api = environment.apiUrl;

  // ── Onglet actif ──────────────────────────────────────────────────────────
  activeTab = signal<'builtin' | 'custom'>('builtin');

  // ── Agents intégrés ───────────────────────────────────────────────────────
  builtinAgents   = signal<BuiltinAgentConfig[]>([]);
  isLoadingBuiltin = signal(true);

  // Agent intégré sélectionné pour édition
  editingBuiltin     = signal<BuiltinAgentConfig | null>(null);
  editBuiltinPrompt  = signal('');
  isSavingBuiltin    = signal(false);
  builtinSaveMsg     = signal('');
  builtinSaveError   = signal('');

  // ── Agents personnalisés ──────────────────────────────────────────────────
  customAgents     = signal<AdminCustomAgent[]>([]);
  isLoadingCustom  = signal(false);

  // Agent custom sélectionné pour édition
  editingCustom      = signal<AdminCustomAgent | null>(null);
  editCustomPrompt   = signal('');
  isSavingCustom     = signal(false);
  customSaveMsg      = signal('');
  customSaveError    = signal('');

  constructor(private http: HttpClient) {}

  ngOnInit() {
    this.loadBuiltinAgents();
  }

  // ── Chargement ───────────────────────────────────────────────────────────
  loadBuiltinAgents() {
    this.isLoadingBuiltin.set(true);
    this.http.get<BuiltinAgentConfig[]>(`${this.api}/admin/agents/builtin`).subscribe({
      next: (agents) => { this.builtinAgents.set(agents); this.isLoadingBuiltin.set(false); },
      error: () => this.isLoadingBuiltin.set(false),
    });
  }

  loadCustomAgents() {
    this.isLoadingCustom.set(true);
    this.http.get<AdminCustomAgent[]>(`${this.api}/admin/agents/custom`).subscribe({
      next: (agents) => { this.customAgents.set(agents); this.isLoadingCustom.set(false); },
      error: () => this.isLoadingCustom.set(false),
    });
  }

  switchTab(tab: 'builtin' | 'custom') {
    this.activeTab.set(tab);
    this.editingBuiltin.set(null);
    this.editingCustom.set(null);
    if (tab === 'custom' && !this.customAgents().length) {
      this.loadCustomAgents();
    }
  }

  // ── Édition agent intégré ─────────────────────────────────────────────────
  selectBuiltin(agent: BuiltinAgentConfig) {
    this.editingBuiltin.set(agent);
    this.editBuiltinPrompt.set(agent.system_prompt);
    this.builtinSaveMsg.set('');
    this.builtinSaveError.set('');
  }

  saveBuiltinPrompt() {
    const agent = this.editingBuiltin();
    if (!agent) return;
    this.isSavingBuiltin.set(true);
    this.builtinSaveMsg.set('');
    this.builtinSaveError.set('');

    this.http.put<BuiltinAgentConfig>(`${this.api}/admin/agents/builtin/${agent.agent_id}`, {
      system_prompt: this.editBuiltinPrompt(),
    }).subscribe({
      next: (updated) => {
        this.builtinAgents.update(list =>
          list.map(a => a.agent_id === agent.agent_id ? updated : a)
        );
        this.editingBuiltin.set(updated);
        this.isSavingBuiltin.set(false);
        this.builtinSaveMsg.set('Prompt enregistré avec succès.');
        setTimeout(() => this.builtinSaveMsg.set(''), 3000);
      },
      error: (err) => {
        this.isSavingBuiltin.set(false);
        this.builtinSaveError.set(err.error?.detail || 'Erreur lors de la sauvegarde.');
      },
    });
  }

  resetBuiltinPrompt() {
    const agent = this.editingBuiltin();
    if (!agent) return;
    if (!confirm(`Réinitialiser le prompt de "${agent.name}" au défaut ?`)) return;

    this.http.delete(`${this.api}/admin/agents/builtin/${agent.agent_id}`).subscribe({
      next: () => {
        this.loadBuiltinAgents();
        this.editingBuiltin.set(null);
        this.builtinSaveMsg.set('Prompt réinitialisé.');
      },
    });
  }

  // ── Édition agent personnalisé ────────────────────────────────────────────
  selectCustom(agent: AdminCustomAgent) {
    this.editingCustom.set(agent);
    this.editCustomPrompt.set(agent.system_prompt);
    this.customSaveMsg.set('');
    this.customSaveError.set('');
  }

  saveCustomPrompt() {
    const agent = this.editingCustom();
    if (!agent) return;
    this.isSavingCustom.set(true);
    this.customSaveMsg.set('');
    this.customSaveError.set('');

    this.http.put(`${this.api}/admin/agents/custom/${agent.id}`, {
      system_prompt: this.editCustomPrompt(),
    }).subscribe({
      next: () => {
        this.customAgents.update(list =>
          list.map(a => a.id === agent.id ? { ...a, system_prompt: this.editCustomPrompt() } : a)
        );
        const updated = { ...agent, system_prompt: this.editCustomPrompt() };
        this.editingCustom.set(updated);
        this.isSavingCustom.set(false);
        this.customSaveMsg.set('Prompt mis à jour.');
        setTimeout(() => this.customSaveMsg.set(''), 3000);
      },
      error: (err) => {
        this.isSavingCustom.set(false);
        this.customSaveError.set(err.error?.detail || 'Erreur lors de la mise à jour.');
      },
    });
  }

  getIconSvg(icon: string): string {
    const icons: Record<string, string> = {
      gavel:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 14l-8 8"/><path d="M5 9l10-10 7 7-5 5z"/></svg>',
      heart:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      shield:    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      briefcase: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
      users:     '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      home:      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    };
    return icons[icon] || icons['gavel'];
  }
}

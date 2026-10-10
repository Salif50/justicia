import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

// ── Types ────────────────────────────────────────────────────────────────────
export interface DocumentTemplate {
  doc_id: string;
  nom: string;
  type: string;
  numero: string;
  date_adoption: string;
  nombre_pages: number;
  source_officielle: string;
  domaine: string;
  url_source: string;
}

export interface BuiltinAgent {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  domain_filter: string | null;
}

export interface CustomAgent {
  id: string;
  name: string;
  description: string;
  system_prompt: string;
  doc_ids: string[];
  domains: string[];
  created_at: string;
}

// ── Composant ────────────────────────────────────────────────────────────────
@Component({
  selector: 'app-agent-personnalise',
  imports: [CommonModule, FormsModule],
  templateUrl: './custom-agents.html',
  styleUrl: './custom-agents.scss',
})
export class CustomAgents implements OnInit {
  private api = environment.apiUrl;

  // ── Données ───────────────────────────────────────────────────────────────
  builtinAgents   = signal<BuiltinAgent[]>([]);
  customAgents    = signal<CustomAgent[]>([]);
  templates       = signal<DocumentTemplate[]>([]);

  isLoadingAgents      = signal(true);
  isLoadingTemplates   = signal(false);
  templatesLoadError   = signal(false);

  // ── Modal création ────────────────────────────────────────────────────────
  showModal      = signal(false);
  modalStep      = signal<1 | 2>(1);  // step 1 = choisir templates, step 2 = nommer + prompt
  isCreating     = signal(false);
  createError    = signal('');
  createSuccess  = signal('');

  // ── Modal édition d'un agent existant ────────────────────────────────────
  showEditModal      = signal(false);
  editingAgent       = signal<CustomAgent | null>(null);
  editName           = signal('');
  editDescription    = signal('');
  editSystemPrompt   = signal('');
  isSavingEdit       = signal(false);
  editError          = signal('');
  showPromptHelp     = signal(false);

  // ── Sélection de templates ────────────────────────────────────────────────
  selectedDocIds  = signal<Set<string>>(new Set());
  templateSearch  = signal('');
  domainFilter    = signal('Tous');

  // ── Formulaire de création ────────────────────────────────────────────────
  agentName         = signal('');
  agentDescription  = signal('');
  agentSystemPrompt = signal('');

  // ── Domaines uniques ─────────────────────────────────────────────────────
  availableDomains = computed(() => {
    const domains = new Set(this.templates().map(t => t.domaine).filter(Boolean));
    return ['Tous', ...Array.from(domains).sort()];
  });

  // ── Templates filtrés ─────────────────────────────────────────────────────
  filteredTemplates = computed(() => {
    const search = this.templateSearch().toLowerCase().trim();
    const domain = this.domainFilter();
    return this.templates().filter(t => {
      const matchesDomain = domain === 'Tous' || t.domaine === domain;
      const matchesSearch = !search ||
        t.nom.toLowerCase().includes(search) ||
        t.domaine.toLowerCase().includes(search) ||
        t.type.toLowerCase().includes(search) ||
        t.numero.toLowerCase().includes(search);
      return matchesDomain && matchesSearch;
    });
  });

  // ── Templates sélectionnés (objets complets) ──────────────────────────────
  selectedTemplates = computed(() =>
    this.templates().filter(t => this.selectedDocIds().has(t.doc_id))
  );

  // ── Domaines sélectionnés (uniques) ───────────────────────────────────────
  selectedDomains = computed(() => {
    const domains = new Set(this.selectedTemplates().map(t => t.domaine));
    return Array.from(domains);
  });

  // ── Suggestion de nom basée sur les templates ──────────────────────────────
  suggestedName = computed(() => {
    const domains = this.selectedDomains();
    if (!domains.length) return '';
    if (domains.length === 1) return `Expert ${domains[0]}`;
    if (domains.length === 2) return `Expert ${domains[0]} & ${domains[1]}`;
    return `Expert Multi-domaines (${domains.length} domaines)`;
  });

  constructor(private router: Router, private http: HttpClient) {}

  ngOnInit() {
    this.loadAll();
  }

  // Exposé au template pour créer un Set vide
  readonly emptySet = () => new Set<string>();

  private loadAll() {
    this.isLoadingAgents.set(true);

    // Built-in agents
    this.http.get<BuiltinAgent[]>(`${this.api}/agents/builtin`).subscribe({
      next: (a) => this.builtinAgents.set(a),
      error: () => this.builtinAgents.set(this._fallbackBuiltins()),
    });

    // Custom agents
    this.http.get<CustomAgent[]>(`${this.api}/agents/my`).subscribe({
      next: (a) => { this.customAgents.set(a); this.isLoadingAgents.set(false); },
      error: () => this.isLoadingAgents.set(false),
    });
  }

  // ── Lancer une conversation ───────────────────────────────────────────────
  startConversation(agentId: string) {
    localStorage.setItem('selectedAgent', agentId);
    this.router.navigate(['/dashboard/chat']);
  }

  // ── Modal création : ouvrir ──────────────────────────────────────────────
  openCreateModal() {
    this.selectedDocIds.set(new Set());
    this.templateSearch.set('');
    this.domainFilter.set('Tous');
    this.agentName.set('');
    this.agentDescription.set('');
    this.agentSystemPrompt.set('');
    this.createError.set('');
    this.modalStep.set(1);
    this.showModal.set(true);

    if (!this.templates().length) {
      this._fetchTemplates();
    }
  }

  retryLoadTemplates() {
    this.templatesLoadError.set(false);
    this._fetchTemplates();
  }

  private _fetchTemplates() {
    this.isLoadingTemplates.set(true);
    this.templatesLoadError.set(false);
    this.http.get<DocumentTemplate[]>(`${this.api}/agents/templates`).subscribe({
      next: (t) => {
        this.templates.set(t);
        this.isLoadingTemplates.set(false);
      },
      error: () => {
        this.isLoadingTemplates.set(false);
        this.templatesLoadError.set(true);
      },
    });
  }

  closeModal() {
    this.showModal.set(false);
  }

  // ── Modal édition : ouvrir / fermer / sauvegarder ────────────────────────
  openEditModal(agent: CustomAgent, event: Event) {
    event.stopPropagation();
    this.editingAgent.set(agent);
    this.editName.set(agent.name);
    this.editDescription.set(agent.description);
    this.editSystemPrompt.set(agent.system_prompt || '');
    this.editError.set('');
    this.showEditModal.set(true);
  }

  closeEditModal() {
    this.showEditModal.set(false);
    this.editingAgent.set(null);
  }

  saveEdit() {
    const agent = this.editingAgent();
    if (!agent) return;
    const name = this.editName().trim();
    if (!name) { this.editError.set('Le nom est obligatoire.'); return; }

    this.isSavingEdit.set(true);
    this.editError.set('');
    this.http.put<CustomAgent>(`${this.api}/agents/${agent.id}`, {
      name,
      description:   this.editDescription().trim(),
      system_prompt: this.editSystemPrompt().trim(),
    }).subscribe({
      next: (updated) => {
        this.customAgents.update(list =>
          list.map(a => a.id === agent.id ? updated : a)
        );
        this.isSavingEdit.set(false);
        this.closeEditModal();
        this.createSuccess.set('Agent mis à jour.');
        setTimeout(() => this.createSuccess.set(''), 3000);
      },
      error: (err) => {
        this.isSavingEdit.set(false);
        this.editError.set(err.error?.detail || 'Erreur lors de la mise à jour.');
      },
    });
  }

  // ── Sélection / désélection d'un template ────────────────────────────────
  toggleTemplate(docId: string) {
    const current = new Set(this.selectedDocIds());
    if (current.has(docId)) {
      current.delete(docId);
    } else {
      current.add(docId);
    }
    this.selectedDocIds.set(current);
  }

  isSelected(docId: string): boolean {
    return this.selectedDocIds().has(docId);
  }

  // ── Étape 1 → Étape 2 ────────────────────────────────────────────────────
  goToStep2() {
    if (!this.selectedDocIds().size) return;
    // Pré-remplir le nom avec la suggestion
    if (!this.agentName()) {
      this.agentName.set(this.suggestedName());
    }
    this.modalStep.set(2);
  }

  goBackToStep1() {
    this.modalStep.set(1);
  }

  // ── Créer l'agent ─────────────────────────────────────────────────────────
  createAgent() {
    const name = this.agentName().trim();
    if (!name) { this.createError.set('Le nom de l\'agent est obligatoire.'); return; }
    if (!this.selectedDocIds().size) { this.createError.set('Sélectionnez au moins un document.'); return; }

    this.isCreating.set(true);
    this.createError.set('');

    this.http.post<CustomAgent>(`${this.api}/agents/`, {
      name,
      description:   this.agentDescription().trim(),
      system_prompt: this.agentSystemPrompt().trim(),
      doc_ids:       Array.from(this.selectedDocIds()),
    }).subscribe({
      next: (agent) => {
        this.customAgents.update(list => [agent, ...list]);
        this.isCreating.set(false);
        this.showModal.set(false);
        this.createSuccess.set(`Agent "${agent.name}" créé avec succès !`);
        setTimeout(() => this.createSuccess.set(''), 4000);
      },
      error: (err) => {
        this.isCreating.set(false);
        this.createError.set(err.error?.detail || 'Erreur lors de la création.');
      },
    });
  }

  // ── Supprimer un agent personnalisé ──────────────────────────────────────
  deleteCustomAgent(agent: CustomAgent, event: Event) {
    event.stopPropagation();
    if (!confirm(`Supprimer l'agent "${agent.name}" ?`)) return;

    this.http.delete(`${this.api}/agents/${agent.id}`).subscribe({
      next: () => {
        this.customAgents.update(list => list.filter(a => a.id !== agent.id));
      },
      error: (err) => alert(err.error?.detail || 'Erreur lors de la suppression.'),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  getDocTypeBadgeClass(type: string): string {
    switch (type.toUpperCase()) {
      case 'LOI':       return 'badge-loi';
      case 'CODE':      return 'badge-code';
      case 'DECRET':
      case 'DECRETS':   return 'badge-decret';
      case 'INSTRUCTION': return 'badge-instruction';
      default:          return 'badge-autre';
    }
  }

  getDomainColor(domain: string): string {
    const colors: Record<string, string> = {
      'Droit pénal':              '#dc2626',
      'Droit foncier':            '#d97706',
      'Droit du travail':         '#FF8A00',
      'Droit de la famille':      '#db2777',
      'Economie':                 '#059669',
      'Administration':           '#7c3aed',
      'Finance':                  '#FF5A00',
      'Finance publique':         '#FF5A00',
      'Fiscalité':                '#ca8a04',
      'Environnement':            '#16a34a',
      'Droit constitutionnel':    '#1d4ed8',
      'Numérique':                '#FF5A00',
      'Mines et ressources naturelles': '#92400e',
      'Droit civil':              '#0f766e',
      'Sécurité sociale':         '#c2410c',
      'Energie':                  '#f59e0b',
      'Justice':                  '#1e40af',
      'Marchés publics':          '#0284c7',
      'Transport et commerce':    '#0369a1',
      'Commerce et assurances':   '#0369a1',
      'Sécurité publique':        '#374151',
      'Défense et sécurité':      '#1f2937',
      'Droit électoral':          '#9333ea',
    };
    return colors[domain] || '#6b7280';
  }

  getBuiltinIcon(icon: string): string {
    const icons: Record<string, string> = {
      gavel:     '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 14l-8 8"/><path d="M5 9l10-10 7 7-5 5z"/></svg>',
      heart:     '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
      shield:    '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      briefcase: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
      users:     '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
      home:      '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    };
    return icons[icon] || icons['gavel'];
  }

  private _fallbackBuiltins(): BuiltinAgent[] {
    return [
      { id: 'jurisprudence', name: 'Agent Jurisprudence',     description: 'Recherche et analyse de jurisprudence tous domaines.', icon: 'gavel',     category: 'Droit général',       domain_filter: null },
      { id: 'matrimonial',   name: 'Agent Droit Matrimonial', description: 'Questions de droit de la famille et matrimonial.',      icon: 'heart',     category: 'Droit de la famille', domain_filter: 'Droit de la famille' },
      { id: 'penal',         name: 'Agent Droit Pénal',       description: 'Infractions, sanctions et procédure pénale.',           icon: 'shield',    category: 'Droit pénal',         domain_filter: 'Droit pénal' },
      { id: 'commercial',    name: 'Agent Droit Commercial',  description: 'Droit des affaires, contrats et entreprises.',          icon: 'briefcase', category: 'Droit commercial',    domain_filter: 'Economie' },
      { id: 'travail',       name: 'Agent Droit du Travail',  description: 'Relations de travail et droits des employés.',          icon: 'users',     category: 'Droit du travail',    domain_filter: 'Droit du travail' },
      { id: 'immobilier',    name: 'Agent Droit Immobilier',  description: 'Foncier, propriété immobilière et baux.',               icon: 'home',      category: 'Droit immobilier',    domain_filter: 'Droit foncier' },
    ];
  }
}

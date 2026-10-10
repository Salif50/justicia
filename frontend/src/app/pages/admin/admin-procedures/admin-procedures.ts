import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProcedureService, ProcedureDto, Etape } from '../../../services/procedure.service';

type ViewMode = 'list' | 'form';

interface EtapeForm {
  num:         number;
  titre:       string;
  description: string;
  duree:       string;
  cout:        string;
  lieu:        string;
  optionnel:   boolean;
}

const DIFFICULTES = ['Facile', 'Moyen', 'Complexe'];
const CATEGORIES  = ['Famille', 'Foncier', 'Commerce', 'Pénal', 'Travail', 'Fiscal', 'Administratif'];

function emptyEtape(num: number): EtapeForm {
  return { num, titre: '', description: '', duree: '', cout: '', lieu: '', optionnel: false };
}

function etapeToForm(e: Etape): EtapeForm {
  return {
    num:         e.num,
    titre:       e.titre,
    description: e.description,
    duree:       e.duree       ?? '',
    cout:        e.cout        ?? '',
    lieu:        e.lieu        ?? '',
    optionnel:   e.optionnel   ?? false,
  };
}

@Component({
  selector:    'app-admin-procedures',
  imports:     [CommonModule, FormsModule],
  templateUrl: './admin-procedures.html',
  styleUrl:    './admin-procedures.scss',
})
export class AdminProcedures implements OnInit {
  private svc = inject(ProcedureService);

  // ── State ─────────────────────────────────────────────────────────────────
  procedures  = signal<ProcedureDto[]>([]);
  isLoading   = signal(true);
  viewMode    = signal<ViewMode>('list');
  editingId   = signal<number | null>(null);
  error       = signal('');
  success     = signal('');
  saving      = signal(false);

  readonly DIFFICULTES = DIFFICULTES;
  readonly CATEGORIES  = CATEGORIES;

  // ── Formulaire ────────────────────────────────────────────────────────────
  form = this._emptyForm();
  formDocs:      string[]    = [];
  formEtapes:    EtapeForm[] = [];
  formQuestions: string[]    = [];

  readonly activeCount = computed(() => this.procedures().filter(p => p.actif).length);
  readonly urgentCount = computed(() => this.procedures().filter(p => p.urgence).length);

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnInit() { this.load(); }

  load() {
    this.isLoading.set(true);
    this.svc.adminGetAll().subscribe({
      next:  data => { this.procedures.set(data); this.isLoading.set(false); },
      error: ()   => { this.error.set('Erreur de chargement.'); this.isLoading.set(false); },
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  openCreate() {
    this.editingId.set(null);
    this.form = this._emptyForm();
    this.formDocs      = [''];
    this.formEtapes    = [emptyEtape(1)];
    this.formQuestions = [''];
    this.error.set('');
    this.viewMode.set('form');
  }

  openEdit(p: ProcedureDto) {
    this.editingId.set(p.id);
    this.form = {
      slug:         p.slug,
      titre:        p.titre,
      categorie:    p.categorie,
      icon:         p.icon,
      description:  p.description,
      duree_totale: p.duree_totale,
      cout_estime:  p.cout_estime,
      difficulte:   p.difficulte,
      urgence:      p.urgence,
      conseil:      p.conseil,
      base_legale:  p.base_legale,
      ordre:        p.ordre,
      actif:        p.actif,
    };
    this.formDocs      = p.docs_requis.length   ? [...p.docs_requis]              : [''];
    this.formEtapes    = p.etapes.length         ? p.etapes.map(etapeToForm)       : [emptyEtape(1)];
    this.formQuestions = p.questions_ia.length   ? [...p.questions_ia]             : [''];
    this.error.set('');
    this.viewMode.set('form');
  }

  cancel() {
    this.viewMode.set('list');
    this.error.set('');
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────
  save() {
    this.error.set('');
    if (!this.form.slug || !this.form.titre || !this.form.categorie) {
      this.error.set('Slug, titre et catégorie sont obligatoires.');
      return;
    }

    this.saving.set(true);
    const payload = {
      ...this.form,
      docs_requis:  this.formDocs.filter(d => d.trim()),
      etapes:       this.formEtapes.map((e, i) => ({
        num:         e.num || i + 1,
        titre:       e.titre,
        description: e.description,
        duree:       e.duree       || undefined,
        cout:        e.cout        || undefined,
        lieu:        e.lieu        || undefined,
        optionnel:   e.optionnel,
      })),
      questions_ia: this.formQuestions.filter(q => q.trim()),
    };

    const id = this.editingId();
    const req = id ? this.svc.adminUpdate(id, payload as any) : this.svc.adminCreate(payload as any);

    req.subscribe({
      next: () => {
        this.saving.set(false);
        this.success.set(id ? 'Démarche mise à jour.' : 'Démarche créée.');
        this.viewMode.set('list');
        this.load();
        setTimeout(() => this.success.set(''), 3000);
      },
      error: err => {
        this.saving.set(false);
        this.error.set(err.error?.detail ?? 'Erreur lors de la sauvegarde.');
      },
    });
  }

  toggle(p: ProcedureDto) {
    this.svc.adminToggle(p.id).subscribe({
      next: () => this.load(),
      error: () => this.error.set('Erreur.'),
    });
  }

  delete(p: ProcedureDto) {
    if (!confirm(`Supprimer définitivement "${p.titre}" ?`)) return;
    this.svc.adminDelete(p.id).subscribe({
      next: () => { this.success.set('Démarche supprimée.'); this.load(); },
      error: () => this.error.set('Erreur lors de la suppression.'),
    });
  }

  // ── Gestion docs ──────────────────────────────────────────────────────────
  addDoc()           { this.formDocs.push(''); }
  removeDoc(i: number) { this.formDocs.splice(i, 1); }
  trackByIdx(i: number) { return i; }

  // ── Gestion étapes ────────────────────────────────────────────────────────
  addEtape() {
    this.formEtapes.push(emptyEtape(this.formEtapes.length + 1));
  }
  removeEtape(i: number) {
    this.formEtapes.splice(i, 1);
    this.formEtapes.forEach((e, idx) => e.num = idx + 1);
  }
  moveEtape(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= this.formEtapes.length) return;
    [this.formEtapes[i], this.formEtapes[j]] = [this.formEtapes[j], this.formEtapes[i]];
    this.formEtapes.forEach((e, idx) => e.num = idx + 1);
  }

  // ── Gestion questions ─────────────────────────────────────────────────────
  addQuestion()           { this.formQuestions.push(''); }
  removeQuestion(i: number) { this.formQuestions.splice(i, 1); }

  // ── Helpers ───────────────────────────────────────────────────────────────
  diffBadge(d: string): string {
    return { 'Facile': 'badge--easy', 'Moyen': 'badge--med', 'Complexe': 'badge--hard' }[d] ?? '';
  }

  private _emptyForm() {
    return {
      slug: '', titre: '', categorie: CATEGORIES[0], icon: '📋',
      description: '', duree_totale: '', cout_estime: '',
      difficulte: 'Moyen', urgence: false,
      conseil: '', base_legale: '', ordre: 0, actif: true,
    };
  }
}

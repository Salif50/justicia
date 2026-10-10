import {
  Component, signal, computed, inject, OnInit, OnDestroy,
  ElementRef, ViewChild, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  GenerationService,
  ContractTemplate,
  GenerateResponse,
  AnalyzeResponse,
  DocumentArchiveOut,
  DocumentArchiveDetail,
} from '../../services/generation.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

type MainTab  = 'new' | 'analyze' | 'archives';
type NewStage = 'select-type' | 'fill-form' | 'generating' | 'done' | 'error';
type AnaStage = 'idle' | 'analyzing' | 'done' | 'error';

const DOMAIN_COLORS: Record<string, string> = {
  'Travail & Social':             '#7c3aed',
  'Immobilier & Foncier':         '#d97706',
  'Commercial & Affaires':        '#059669',
  'Sociétaire & Associatif':      '#FF5A00',
  'Civil & Famille':              '#db2777',
  'Protection & Confidentialité': '#dc2626',
};

@Component({
  selector:    'app-generation',
  imports:     [CommonModule, FormsModule, UiIcon],
  templateUrl: './generation.html',
  styleUrl:    './generation.scss',
})
export class Generation implements OnInit, OnDestroy {
  private svc = inject(GenerationService);

  @ViewChild('analyzeFileInput') analyzeFileInputRef!: ElementRef<HTMLInputElement>;
  @ViewChild('contractEditor')   contractEditorRef!:   ElementRef<HTMLTextAreaElement>;

  readonly DOMAIN_COLORS = DOMAIN_COLORS;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab = signal<MainTab>('new');

  // ── Nouveau contrat ───────────────────────────────────────────────────────
  newStage        = signal<NewStage>('select-type');
  contractType    = signal<string>('');
  templates       = signal<ContractTemplate[]>([]);
  formData        = signal<Record<string, string>>({});
  userDirectives  = signal<string>('');
  generateResult  = signal<GenerateResponse | null>(null);
  editableContent = signal<string>('');
  newError        = signal<string>('');
  searchQuery     = signal<string>('');
  viewMode        = signal<'preview' | 'edit'>('preview');
  copyDone        = signal<boolean>(false);

  // ── Thinking animation ────────────────────────────────────────────────────
  thinkingStep = signal(0);
  readonly thinkingMessages = [
    'Récupération des articles de loi applicables…',
    'Analyse du droit guinéen pertinent…',
    'Rédaction de l\'en-tête et des parties…',
    'Rédaction du préambule et de l\'objet…',
    'Rédaction des clauses principales…',
    'Rédaction des clauses de résiliation…',
    'Ajout des références légales…',
    'Vérification de la conformité OHADA…',
    'Finalisation et signatures…',
  ];
  private _thinkingTimer?: ReturnType<typeof setInterval>;

  // ── Analyser ──────────────────────────────────────────────────────────────
  anaStage       = signal<AnaStage>('idle');
  analyzeType    = signal<string>('auto');
  analyzeFile    = signal<File | null>(null);
  analysisResult = signal<AnalyzeResponse | null>(null);
  anaError       = signal<string>('');
  anaDragOver    = signal<boolean>(false);

  // ── Archives ──────────────────────────────────────────────────────────────
  archives        = signal<DocumentArchiveOut[]>([]);
  archivesLoading = signal<boolean>(false);
  archiveDetail   = signal<DocumentArchiveDetail | null>(null);
  showModal       = signal<boolean>(false);
  modalLoading    = signal<boolean>(false);
  archiveFilter   = signal<'all' | 'generated' | 'analyzed'>('all');
  archiveSearch   = signal<string>('');

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly categories = computed(() => {
    const cats = new Map<string, ContractTemplate[]>();
    for (const t of this.templates()) {
      const cat = t.category || 'Autre';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(t);
    }
    return Array.from(cats.entries()).map(([name, items]) => ({ name, items }));
  });

  readonly filteredTemplates = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.templates();
    return this.templates().filter(t =>
      t.label.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q) ||
      t.domain.toLowerCase().includes(q)
    );
  });

  readonly filteredCategories = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.categories();
    const filtered = this.filteredTemplates();
    const cats = new Map<string, ContractTemplate[]>();
    for (const t of filtered) {
      const cat = t.category || 'Autre';
      if (!cats.has(cat)) cats.set(cat, []);
      cats.get(cat)!.push(t);
    }
    return Array.from(cats.entries()).map(([name, items]) => ({ name, items }));
  });

  readonly currentTemplate = computed(() =>
    this.templates().find(t => t.id === this.contractType()) ?? null
  );

  readonly formValid = computed(() => {
    const tpl = this.currentTemplate();
    if (!tpl) return false;
    return tpl.fields.filter(f => f.required).every(f => !!this.formData()[f.key]?.trim());
  });

  readonly requiredFilled = computed(() => {
    const tpl = this.currentTemplate();
    if (!tpl) return 0;
    const req = tpl.fields.filter(f => f.required);
    return req.filter(f => !!this.formData()[f.key]?.trim()).length;
  });

  readonly requiredTotal = computed(() =>
    this.currentTemplate()?.fields.filter(f => f.required).length ?? 0
  );

  readonly wordCount = computed(() => {
    const text = this.editableContent();
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(Boolean).length;
  });

  readonly filteredArchives = computed(() => {
    let list = this.archives();
    const f = this.archiveFilter();
    if (f !== 'all') list = list.filter(a => a.mode === f);
    const q = this.archiveSearch().toLowerCase();
    if (q) list = list.filter(a =>
      a.title.toLowerCase().includes(q) || a.contract_type.toLowerCase().includes(q)
    );
    return list;
  });

  readonly conformityColor = computed(() => {
    const score = this.analysisResult()?.conformity_score ?? 0;
    if (score >= 75) return '#22c55e';
    if (score >= 50) return '#f59e0b';
    return '#ef4444';
  });

  readonly conformityDash = computed(() => {
    const score = this.analysisResult()?.conformity_score ?? 0;
    const circumference = 2 * Math.PI * 38;
    return `${(score / 100) * circumference} ${circumference}`;
  });

  // ── Init ──────────────────────────────────────────────────────────────────
  ngOnInit() {
    this.svc.getTemplates().subscribe(t => this.templates.set(t));
    this.loadArchives();
  }

  ngOnDestroy() { clearInterval(this._thinkingTimer); }

  // ── Navigation ────────────────────────────────────────────────────────────
  switchTab(tab: MainTab) {
    this.activeTab.set(tab);
    if (tab === 'archives') this.loadArchives();
  }

  // ── Nouveau contrat ───────────────────────────────────────────────────────
  selectType(type: string) {
    this.contractType.set(type);
    this.formData.set({});
    this.userDirectives.set('');
    this.newStage.set('fill-form');
  }

  backToTypeSelect() {
    this.newStage.set('select-type');
    this.contractType.set('');
    this.formData.set({});
    this.userDirectives.set('');
    this.searchQuery.set('');
  }

  updateField(key: string, value: string) {
    this.formData.update(fd => ({ ...fd, [key]: value }));
  }

  generateContract() {
    if (!this.formValid()) return;
    this.newStage.set('generating');
    this.newError.set('');
    this._startThinking();

    this.svc.generateContract({
      contract_type:   this.contractType(),
      form_data:       this.formData(),
      user_directives: this.userDirectives(),
    }).subscribe({
      next: res => {
        this._stopThinking();
        this.generateResult.set(res);
        this.editableContent.set(res.content);
        this.viewMode.set('preview');
        this.newStage.set('done');
        this.loadArchives();
      },
      error: err => {
        this._stopThinking();
        this.newError.set(err.error?.detail ?? 'Erreur lors de la génération.');
        this.newStage.set('error');
      },
    });
  }

  resetNew() {
    this.newStage.set('select-type');
    this.contractType.set('');
    this.formData.set({});
    this.userDirectives.set('');
    this.generateResult.set(null);
    this.editableContent.set('');
    this.newError.set('');
    this.searchQuery.set('');
    clearInterval(this._thinkingTimer);
  }

  async copyContract() {
    try {
      await navigator.clipboard.writeText(this.editableContent());
      this.copyDone.set(true);
      setTimeout(() => this.copyDone.set(false), 2000);
    } catch {}
  }

  downloadTxt() {
    const content = this.editableContent();
    const title   = this.generateResult()?.title ?? 'contrat';
    const blob    = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = `${title.replace(/[^a-z0-9\-_]/gi, '_')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  printAsPdf() { window.print(); }

  domainColor(category: string): string {
    return DOMAIN_COLORS[category] ?? '#64748b';
  }

  // ── Analyser ──────────────────────────────────────────────────────────────
  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent) {
    if (this.activeTab() !== 'analyze') return;
    e.preventDefault();
    this.anaDragOver.set(true);
  }

  @HostListener('dragleave', ['$event'])
  onDragLeave(e: DragEvent) {
    e.preventDefault();
    this.anaDragOver.set(false);
  }

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent) {
    if (this.activeTab() !== 'analyze') return;
    e.preventDefault();
    this.anaDragOver.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.setAnalyzeFile(file);
  }

  openAnalyzeFilePicker() { this.analyzeFileInputRef?.nativeElement?.click(); }

  onAnalyzeFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.setAnalyzeFile(file);
  }

  setAnalyzeFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      this.anaError.set('Seuls les fichiers PDF sont acceptés.'); return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.anaError.set('Fichier trop volumineux (max 25 Mo).'); return;
    }
    this.analyzeFile.set(file);
    this.anaError.set('');
    this.anaStage.set('idle');
    this.analysisResult.set(null);
  }

  removeFile() {
    this.analyzeFile.set(null);
    this.anaStage.set('idle');
    this.analysisResult.set(null);
    if (this.analyzeFileInputRef) this.analyzeFileInputRef.nativeElement.value = '';
  }

  analyzeContract() {
    const file = this.analyzeFile();
    if (!file) return;
    this.anaStage.set('analyzing');
    this.anaError.set('');
    this.analysisResult.set(null);
    this.svc.analyzeContract(file, this.analyzeType()).subscribe({
      next: res => { this.analysisResult.set(res); this.anaStage.set('done'); this.loadArchives(); },
      error: err => { this.anaError.set(err.error?.detail ?? "Erreur lors de l'analyse."); this.anaStage.set('error'); },
    });
  }

  resetAnalyze() {
    this.anaStage.set('idle');
    this.analyzeFile.set(null);
    this.analysisResult.set(null);
    this.anaError.set('');
    if (this.analyzeFileInputRef) this.analyzeFileInputRef.nativeElement.value = '';
  }

  getRiskClass(level: string): string {
    const map: Record<string, string> = { 'faible': 'risk-low', 'moyen': 'risk-medium', 'élevé': 'risk-high' };
    return map[level] ?? 'risk-medium';
  }

  getSeverityLabel(s: string): string {
    const map: Record<string, string> = { critique: 'Critique', majeur: 'Majeur', mineur: 'Mineur' };
    return map[s] ?? s;
  }

  issuesBySeverity(severity: string) {
    return this.analysisResult()?.issues.filter(i => i.severity === severity) ?? [];
  }

  // ── Archives ──────────────────────────────────────────────────────────────
  loadArchives() {
    this.archivesLoading.set(true);
    this.svc.getArchives().subscribe({
      next:  list => { this.archives.set(list); this.archivesLoading.set(false); },
      error: ()   => this.archivesLoading.set(false),
    });
  }

  openArchive(id: string) {
    this.showModal.set(true);
    this.archiveDetail.set(null);
    this.modalLoading.set(true);
    this.svc.getArchive(id).subscribe({
      next:  d => { this.archiveDetail.set(d); this.modalLoading.set(false); },
      error: () => this.modalLoading.set(false),
    });
  }

  closeModal() { this.showModal.set(false); this.archiveDetail.set(null); }

  deleteArchive(id: string, e: Event) {
    e.stopPropagation();
    if (!confirm('Supprimer ce document ?')) return;
    this.svc.deleteArchive(id).subscribe({
      next: () => {
        this.archives.update(list => list.filter(a => a.id !== id));
        if (this.archiveDetail()?.id === id) this.closeModal();
      },
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  parseAnalysis(raw: string | null): any {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch { return null; }
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  contractTypeLabel(type: string): string {
    return this.templates().find(x => x.id === type)?.label ?? type;
  }

  fileSizeLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  iconEmoji(iconName: string): string {
    const icons: Record<string, string> = {
      briefcase: 'briefcase', home: 'home', 'shopping-bag': 'shopping-bag', tool: 'hammer',
      building: 'building', handshake: 'handshake', users: 'users', banknote: 'wallet',
      'file-text': 'clipboard', gift: 'gift', 'user-check': 'check-circle',
      'arrow-right-circle': 'rotate', lock: 'lock', 'hard-hat': 'alert',
      truck: 'truck', store: 'store',
    };
    return icons[iconName] ?? 'file';
  }

  readonly auditFeatures = [
    { icon: 'clipboard', title: 'Clauses obligatoires', desc: 'Détecte les clauses manquantes requises par la loi' },
    { icon: 'alert-triangle', title: 'Clauses illégales', desc: 'Identifie les clauses contraires au droit guinéen' },
    { icon: 'chart', title: 'Score de conformité', desc: 'Note globale de 0 à 100 selon les lois applicables' },
    { icon: 'lightbulb', title: 'Suggestions de correction', desc: 'Reformulations recommandées pour chaque problème' },
    { icon: 'book-open', title: 'Références légales', desc: 'Articles de loi guinéens cités pour chaque point' },
  ];

  private _startThinking() {
    this.thinkingStep.set(0);
    this._thinkingTimer = setInterval(() => {
      this.thinkingStep.update(s => s < this.thinkingMessages.length - 1 ? s + 1 : s);
    }, 2800);
  }

  private _stopThinking() {
    clearInterval(this._thinkingTimer);
    this.thinkingStep.set(this.thinkingMessages.length - 1);
  }
}

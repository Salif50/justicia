import {
  Component, signal, computed, inject, OnDestroy,
  ElementRef, ViewChild, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ComparisonService,
  CompareTextsResponse,
  LegalCompareResponse,
  DiffItem,
  ArticleCheck,
} from '../../services/comparison.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

type MainTab  = 'compare' | 'legal';
type CmpStage = 'idle' | 'loading' | 'done' | 'error';

const LEGAL_DOMAINS = [
  { value: 'general',    label: 'Général (tous domaines)' },
  { value: 'travail',    label: 'Droit du travail' },
  { value: 'commercial', label: 'Droit commercial' },
  { value: 'civil',      label: 'Droit civil' },
  { value: 'immobilier', label: 'Droit immobilier & foncier' },
  { value: 'penal',      label: 'Droit pénal' },
  { value: 'famille',    label: 'Droit de la famille' },
];

const THINKING_COMPARE = [
  'Extraction du contenu des textes…',
  'Recherche des articles de loi applicables…',
  'Identification des différences clés…',
  'Analyse de l\'impact juridique de chaque écart…',
  'Évaluation des avantages et faiblesses…',
  'Calcul du score de similarité…',
  'Rédaction de la recommandation finale…',
];

const THINKING_LEGAL = [
  'Extraction du texte…',
  'Récupération des articles de loi guinéens…',
  'Comparaison article par article…',
  'Identification des clauses manquantes…',
  'Détection des violations légales…',
  'Calcul du score de conformité…',
  'Rédaction des recommandations…',
];

@Component({
  selector:    'app-comparison',
  imports:     [CommonModule, FormsModule, UiIcon],
  templateUrl: './comparison.html',
  styleUrl:    './comparison.scss',
})
export class Comparison implements OnDestroy {
  private svc = inject(ComparisonService);

  @ViewChild('fileInputA') fileInputARef!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputB') fileInputBRef!: ElementRef<HTMLInputElement>;
  @ViewChild('fileInputL') fileInputLRef!: ElementRef<HTMLInputElement>;

  readonly LEGAL_DOMAINS = LEGAL_DOMAINS;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab = signal<MainTab>('compare');

  // ── Comparaison deux textes ───────────────────────────────────────────────
  cmpStage   = signal<CmpStage>('idle');
  cmpError   = signal<string>('');
  cmpResult  = signal<CompareTextsResponse | null>(null);

  textA      = signal<string>('');
  textB      = signal<string>('');
  labelA     = signal<string>('Texte A');
  labelB     = signal<string>('Texte B');
  fileA      = signal<File | null>(null);
  fileB      = signal<File | null>(null);
  modeA      = signal<'text' | 'file'>('text');
  modeB      = signal<'text' | 'file'>('text');
  dragOverA  = signal<boolean>(false);
  dragOverB  = signal<boolean>(false);

  // ── Conformité légale ─────────────────────────────────────────────────────
  legStage   = signal<CmpStage>('idle');
  legError   = signal<string>('');
  legResult  = signal<LegalCompareResponse | null>(null);

  legText    = signal<string>('');
  legLabel   = signal<string>('Mon contrat');
  legDomain  = signal<string>('general');
  legFile    = signal<File | null>(null);
  legMode    = signal<'text' | 'file'>('text');
  legDrag    = signal<boolean>(false);

  // ── Thinking animation ────────────────────────────────────────────────────
  thinkingStep     = signal<number>(0);
  private _timer?: ReturnType<typeof setInterval>;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly cmpValid = computed(() => {
    const hasA = this.modeA() === 'text' ? this.textA().trim().length > 20 : !!this.fileA();
    const hasB = this.modeB() === 'text' ? this.textB().trim().length > 20 : !!this.fileB();
    return hasA && hasB;
  });

  readonly legValid = computed(() =>
    this.legMode() === 'text'
      ? this.legText().trim().length > 20
      : !!this.legFile()
  );

  readonly similarityDash = computed(() => {
    const score = this.cmpResult()?.similarity_score ?? 0;
    const c = 2 * Math.PI * 38;
    return `${(score / 100) * c} ${c}`;
  });

  readonly conformityDash = computed(() => {
    const score = this.legResult()?.conformity_score ?? 0;
    const c = 2 * Math.PI * 38;
    return `${(score / 100) * c} ${c}`;
  });

  readonly similarityColor = computed(() => {
    const s = this.cmpResult()?.similarity_score ?? 0;
    if (s >= 70) return '#22c55e';
    if (s >= 40) return '#f59e0b';
    return '#ef4444';
  });

  readonly conformityColor = computed(() => {
    const s = this.legResult()?.conformity_score ?? 0;
    if (s >= 75) return '#22c55e';
    if (s >= 50) return '#f59e0b';
    return '#ef4444';
  });

  readonly riskColorA = computed(() => {
    const r = this.cmpResult()?.risk_a ?? 0;
    if (r >= 70) return '#ef4444';
    if (r >= 40) return '#f59e0b';
    return '#22c55e';
  });

  readonly riskColorB = computed(() => {
    const r = this.cmpResult()?.risk_b ?? 0;
    if (r >= 70) return '#ef4444';
    if (r >= 40) return '#f59e0b';
    return '#22c55e';
  });

  readonly critiques = computed(() =>
    (this.cmpResult()?.key_differences ?? []).filter(d => d.severity === 'critique')
  );
  readonly majeurs = computed(() =>
    (this.cmpResult()?.key_differences ?? []).filter(d => d.severity === 'majeur')
  );
  readonly mineurs = computed(() =>
    (this.cmpResult()?.key_differences ?? []).filter(d => d.severity === 'mineur')
  );

  readonly articlesConformes = computed(() =>
    (this.legResult()?.articles_compared ?? []).filter(a => a.status === 'conforme')
  );
  readonly articlesPartiels = computed(() =>
    (this.legResult()?.articles_compared ?? []).filter(a => a.status === 'partiel')
  );
  readonly articlesManquants = computed(() =>
    (this.legResult()?.articles_compared ?? []).filter(a => a.status === 'manquant')
  );
  readonly articlesViolations = computed(() =>
    (this.legResult()?.articles_compared ?? []).filter(a => a.status === 'violation')
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnDestroy() { this._stopThinking(); }

  // ── Tab ───────────────────────────────────────────────────────────────────
  switchTab(tab: MainTab) { this.activeTab.set(tab); }

  // ── Comparaison deux textes ───────────────────────────────────────────────
  setModeA(m: 'text' | 'file') { this.modeA.set(m); this.fileA.set(null); }
  setModeB(m: 'text' | 'file') { this.modeB.set(m); this.fileB.set(null); }

  openFileA() { this.fileInputARef?.nativeElement?.click(); }
  openFileB() { this.fileInputBRef?.nativeElement?.click(); }
  openFileL() { this.fileInputLRef?.nativeElement?.click(); }

  onFileASelected(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this._setFile(f, 'A');
  }
  onFileBSelected(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this._setFile(f, 'B');
  }
  onFileLSelected(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this._setLegalFile(f);
  }

  private _setFile(f: File, slot: 'A' | 'B') {
    if (f.type !== 'application/pdf' && !f.name.endsWith('.pdf')) {
      this.cmpError.set('Seuls les PDF sont acceptés.'); return;
    }
    if (f.size > 25 * 1024 * 1024) {
      this.cmpError.set('Fichier trop volumineux (max 25 Mo).'); return;
    }
    this.cmpError.set('');
    if (slot === 'A') this.fileA.set(f);
    else              this.fileB.set(f);
  }

  private _setLegalFile(f: File) {
    if (f.type !== 'application/pdf' && !f.name.endsWith('.pdf')) {
      this.legError.set('Seuls les PDF sont acceptés.'); return;
    }
    if (f.size > 25 * 1024 * 1024) {
      this.legError.set('Fichier trop volumineux (max 25 Mo).'); return;
    }
    this.legError.set('');
    this.legFile.set(f);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent) { e.preventDefault(); }

  onDropA(e: DragEvent) {
    e.preventDefault(); this.dragOverA.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this._setFile(f, 'A');
  }
  onDropB(e: DragEvent) {
    e.preventDefault(); this.dragOverB.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this._setFile(f, 'B');
  }
  onDropL(e: DragEvent) {
    e.preventDefault(); this.legDrag.set(false);
    const f = e.dataTransfer?.files[0];
    if (f) this._setLegalFile(f);
  }

  compare() {
    if (!this.cmpValid()) return;
    this.cmpStage.set('loading');
    this.cmpError.set('');
    this.cmpResult.set(null);
    this._startThinking(THINKING_COMPARE);

    const fa = this.modeA() === 'file' ? this.fileA() : null;
    const fb = this.modeB() === 'file' ? this.fileB() : null;

    this.svc.compareTexts(
      this.textA(), this.textB(),
      this.labelA(), this.labelB(),
      fa, fb,
    ).subscribe({
      next: res => {
        this._stopThinking();
        this.cmpResult.set(res);
        this.cmpStage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.cmpError.set(err.error?.detail ?? 'Erreur lors de la comparaison.');
        this.cmpStage.set('error');
      },
    });
  }

  resetCompare() {
    this.cmpStage.set('idle'); this.cmpError.set(''); this.cmpResult.set(null);
    this.textA.set(''); this.textB.set(''); this.fileA.set(null); this.fileB.set(null);
    this.labelA.set('Texte A'); this.labelB.set('Texte B');
    this.modeA.set('text'); this.modeB.set('text');
    this._stopThinking();
  }

  compareLegal() {
    if (!this.legValid()) return;
    this.legStage.set('loading');
    this.legError.set('');
    this.legResult.set(null);
    this._startThinking(THINKING_LEGAL);

    const f = this.legMode() === 'file' ? this.legFile() : null;

    this.svc.compareLegal(this.legText(), this.legDomain(), this.legLabel(), f).subscribe({
      next: res => {
        this._stopThinking();
        this.legResult.set(res);
        this.legStage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.legError.set(err.error?.detail ?? 'Erreur lors de l\'analyse.');
        this.legStage.set('error');
      },
    });
  }

  resetLegal() {
    this.legStage.set('idle'); this.legError.set(''); this.legResult.set(null);
    this.legText.set(''); this.legFile.set(null); this.legMode.set('text');
    this.legLabel.set('Mon contrat'); this.legDomain.set('general');
    this._stopThinking();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  thinkingMessages: string[] = [];

  private _startThinking(messages: string[]) {
    this.thinkingMessages = messages;
    this.thinkingStep.set(0);
    this._timer = setInterval(() => {
      this.thinkingStep.update(s => s < messages.length - 1 ? s + 1 : s);
    }, 2600);
  }

  private _stopThinking() {
    clearInterval(this._timer);
    if (this.thinkingMessages.length > 0)
      this.thinkingStep.set(this.thinkingMessages.length - 1);
  }

  severityLabel(s: string): string {
    return ({ critique: 'Critique', majeur: 'Majeur', mineur: 'Mineur' } as Record<string, string>)[s] ?? s;
  }

  favorsLabel(f: string, la: string, lb: string): string {
    if (f === 'A') return la;
    if (f === 'B') return lb;
    return 'Neutre';
  }

  statusIcon(s: string): string {
    return ({ conforme: 'check-circle', partiel: 'alert-triangle', manquant: 'square', violation: 'x-circle' } as Record<string, string>)[s] ?? 'help-circle';
  }

  readonly legalInfoItems = [
    { icon: 'clipboard', t: 'Clauses obligatoires', d: 'Identifie les exigences légales manquantes' },
    { icon: 'x-circle', t: 'Violations légales', d: 'Détecte les clauses contraires à la loi guinéenne' },
    { icon: 'alert-triangle', t: 'Points partiels', d: 'Clauses incomplètes ou ambiguës' },
    { icon: 'chart', t: 'Score de conformité', d: 'Note globale de 0 à 100 par rapport au corpus légal' },
    { icon: 'book-open', t: 'Références précises', d: 'Articles cités du droit guinéen et OHADA' },
  ];

  fileSizeLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  domainLabel(val: string): string {
    return LEGAL_DOMAINS.find(d => d.value === val)?.label ?? val;
  }

  async copyText(text: string) {
    try { await navigator.clipboard.writeText(text); } catch {}
  }
}

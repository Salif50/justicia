import {
  Component, signal, computed, inject, HostListener, ElementRef, ViewChild, OnInit, OnDestroy
} from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from '../../../environments/environment';

// ── Types ──────────────────────────────────────────────────────────────────────
interface UploadResponse {
  extracted_text:   string;
  page_count:       number;
  word_count:       number;
  char_count:       number;
  filename:         string;
  is_relevant:      boolean;
  relevance_reason: string;
}

interface SummarySection { icon: string; title: string; content: string; }
interface GenerateResponse {
  title:       string;
  sections:    SummarySection[];
  key_facts:   string[];
  raw_summary: string;
}

interface ArchiveOut {
  id:            string;
  filename:      string;
  page_count:    number;
  word_count:    number;
  detail_level:  string;
  summary_title: string;
  created_at:    string;
}

interface ArchiveDetail extends ArchiveOut {
  extracted_text: string;
  summary:        GenerateResponse;
}

type Stage     = 'idle' | 'extracting' | 'rejected' | 'extracted' | 'generating' | 'done' | 'error';
type MainTab   = 'analyser' | 'archives';

@Component({
  selector:    'app-resume-document',
  imports:     [CommonModule, NgTemplateOutlet, FormsModule],
  templateUrl: './document-summary.html',
  styleUrl:    './document-summary.scss',
})
export class DocumentSummary implements OnInit, OnDestroy {
  private http      = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  private api       = environment.apiUrl;

  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  // ── Onglet principal ──────────────────────────────────────────────────────────
  mainTab = signal<MainTab>('analyser');

  // ── État analyse ──────────────────────────────────────────────────────────────
  stage        = signal<Stage>('idle');
  dragOver     = signal(false);
  errorMsg     = signal('');
  detailLevel  = signal<'brief' | 'standard' | 'detailed'>('standard');

  selectedFile      = signal<File | null>(null);
  filePreviewUrl    = signal<SafeResourceUrl | null>(null);
  uploadResult      = signal<UploadResponse | null>(null);
  summary           = signal<GenerateResponse | null>(null);
  relevanceReason   = signal('');
  forceAnalysis     = signal(false);

  // Modal aperçu PDF
  showPreview = signal(false);
  previewTab  = signal<'pdf' | 'text'>('pdf');

  // ── Archives ──────────────────────────────────────────────────────────────────
  archives        = signal<ArchiveOut[]>([]);
  archivesLoading = signal(false);
  archivesSaved   = signal(false);
  archiveSaving   = signal(false);

  // Modal archive (vue détail)
  archiveDetail        = signal<ArchiveDetail | null>(null);
  archiveDetailLoading = signal(false);
  showArchiveModal     = signal(false);

  // ── Animation IA (génération) ──────────────────────────────────────────────
  thinkingStep = signal(0);
  readonly thinkingMessages = [
    'Lecture et indexation du texte…',
    'Identification des parties impliquées…',
    'Analyse des fondements juridiques…',
    'Recherche des articles et références…',
    'Structuration des sections du résumé…',
    'Vérification des éléments clés…',
    'Rédaction de la synthèse finale…',
  ];
  private _thinkingTimer?: ReturnType<typeof setInterval>;

  // Niveaux de détail
  readonly levels: { value: 'brief' | 'standard' | 'detailed'; label: string; desc: string; color: string }[] = [
    { value: 'brief',    label: 'Court',    desc: "L'essentiel en quelques lignes", color: '#FFA31A' },
    { value: 'standard', label: 'Standard', desc: "Analyse complète et équilibrée",  color: '#FF8A00' },
    { value: 'detailed', label: 'Détaillé', desc: "Analyse approfondie et exhaustive", color: '#7c3aed' },
  ];

  readonly LEVEL_LABELS: Record<string, string> = {
    brief: 'Court', standard: 'Standard', detailed: 'Détaillé',
  };

  readonly LEVEL_COLORS: Record<string, string> = {
    brief: '#FFA31A', standard: '#FF8A00', detailed: '#7c3aed',
  };

  // ── Computed ──────────────────────────────────────────────────────────────────
  readonly canGenerate = computed(() => this.stage() === 'extracted' || this.stage() === 'done' ||
                                       (this.stage() === 'rejected' && this.forceAnalysis()));
  readonly extractionProgress = signal(0);
  private _progressTimer?: ReturnType<typeof setInterval>;

  // ── Init ──────────────────────────────────────────────────────────────────────
  ngOnInit()    { this.loadArchives(); }
  ngOnDestroy() { clearInterval(this._thinkingTimer); clearInterval(this._progressTimer); }

  // ── Navigation onglets ────────────────────────────────────────────────────────
  switchTab(tab: MainTab) {
    this.mainTab.set(tab);
    if (tab === 'archives') this.loadArchives();
  }

  // ── Drag & Drop ───────────────────────────────────────────────────────────────
  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent) { e.preventDefault(); this.dragOver.set(true); }

  @HostListener('dragleave', ['$event'])
  onDragLeave(e: DragEvent) { e.preventDefault(); this.dragOver.set(false); }

  @HostListener('drop', ['$event'])
  onDrop(e: DragEvent) {
    e.preventDefault(); this.dragOver.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.processFile(file);
  }

  openFilePicker() { this.fileInputRef?.nativeElement?.click(); }

  onFileSelected(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) this.processFile(file);
  }

  processFile(file: File) {
    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
      this.setError('Seuls les fichiers PDF sont acceptés.'); return;
    }
    if (file.size > 25 * 1024 * 1024) {
      this.setError('Fichier trop volumineux. Maximum 25 Mo.'); return;
    }
    this.forceAnalysis.set(false);
    this.selectedFile.set(file);
    const url = URL.createObjectURL(file);
    this.filePreviewUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(url));
    this.uploadAndExtract(file);
  }

  // ── Upload + Extraction ───────────────────────────────────────────────────────
  uploadAndExtract(file: File) {
    this.stage.set('extracting');
    this.errorMsg.set('');
    this.summary.set(null);
    this.uploadResult.set(null);
    this.archivesSaved.set(false);
    this.relevanceReason.set('');
    this._startProgress();

    const fd = new FormData();
    fd.append('file', file, file.name);
    this.http.post<UploadResponse>(`${this.api}/resume/upload`, fd).subscribe({
      next: r => {
        this._stopProgress();
        this.uploadResult.set(r);

        // Vérification de pertinence
        if (!r.is_relevant && !this.forceAnalysis()) {
          this.relevanceReason.set(r.relevance_reason);
          this.stage.set('rejected');
        } else {
          this.stage.set('extracted');
        }
      },
      error: err => { this._stopProgress(); this.setError(err.error?.detail ?? 'Erreur d\'extraction.'); },
    });
  }

  // Forcer l'analyse malgré la non-pertinence
  forceAndAnalyze() {
    this.forceAnalysis.set(true);
    this.stage.set('extracted');
  }

  // ── Génération résumé LLM ─────────────────────────────────────────────────────
  generateSummary() {
    const r = this.uploadResult();
    if (!r) return;
    this.stage.set('generating');
    this.summary.set(null);
    this.archivesSaved.set(false);
    this._startThinking();

    this.http.post<GenerateResponse>(`${this.api}/resume/generate`, {
      extracted_text: r.extracted_text,
      filename:       r.filename,
      detail_level:   this.detailLevel(),
    }).subscribe({
      next: s => {
        this._stopThinking();
        this.summary.set(s);
        this.stage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.setError(err.error?.detail ?? 'Erreur de génération.');
      },
    });
  }

  // ── Archiver ──────────────────────────────────────────────────────────────────
  saveToArchive() {
    const r = this.uploadResult();
    const s = this.summary();
    if (!r || !s) return;
    this.archiveSaving.set(true);
    this.http.post<ArchiveOut>(`${this.api}/resume/archives`, {
      filename:       r.filename,
      page_count:     r.page_count,
      word_count:     r.word_count,
      detail_level:   this.detailLevel(),
      extracted_text: r.extracted_text,
      summary:        s,
    }).subscribe({
      next: arch => {
        this.archiveSaving.set(false);
        this.archivesSaved.set(true);
        this.archives.update(list => [arch, ...list]);
      },
      error: () => this.archiveSaving.set(false),
    });
  }

  // ── Liste des archives ────────────────────────────────────────────────────────
  loadArchives() {
    this.archivesLoading.set(true);
    this.http.get<ArchiveOut[]>(`${this.api}/resume/archives`).subscribe({
      next:  list => { this.archives.set(list); this.archivesLoading.set(false); },
      error: ()   => this.archivesLoading.set(false),
    });
  }

  // ── Voir archive (modal détail) ───────────────────────────────────────────────
  openArchive(id: string) {
    this.showArchiveModal.set(true);
    this.archiveDetail.set(null);
    this.archiveDetailLoading.set(true);
    this.http.get<ArchiveDetail>(`${this.api}/resume/archives/${id}`).subscribe({
      next:  d => { this.archiveDetail.set(d); this.archiveDetailLoading.set(false); },
      error: () => this.archiveDetailLoading.set(false),
    });
  }

  closeArchiveModal() { this.showArchiveModal.set(false); this.archiveDetail.set(null); }

  deleteArchive(id: string) {
    if (!confirm('Supprimer cette archive ?')) return;
    this.http.delete(`${this.api}/resume/archives/${id}`).subscribe({
      next: () => {
        this.archives.update(list => list.filter(a => a.id !== id));
        if (this.archiveDetail()?.id === id) this.closeArchiveModal();
      },
    });
  }

  // ── Aperçu PDF ────────────────────────────────────────────────────────────────
  openPreview()  { this.showPreview.set(true); }
  closePreview() { this.showPreview.set(false); }

  // ── Reset ────────────────────────────────────────────────────────────────────
  reset() {
    this.stage.set('idle'); this.selectedFile.set(null);
    this.filePreviewUrl.set(null); this.uploadResult.set(null);
    this.summary.set(null); this.errorMsg.set(''); this.archivesSaved.set(false);
    this.forceAnalysis.set(false); this.relevanceReason.set('');
    clearInterval(this._thinkingTimer);
    if (this.fileInputRef) this.fileInputRef.nativeElement.value = '';
  }

  // ── Copier résumé ─────────────────────────────────────────────────────────────
  copied = signal(false);
  copyResume(s: GenerateResponse) {
    const text = [`# ${s.title}`, '', ...s.sections.map(sec => `## ${sec.title}\n${sec.content}`),
      '', '## Points clés', ...s.key_facts.map(f => `• ${f}`)].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.copied.set(true); setTimeout(() => this.copied.set(false), 2000);
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  private setError(msg: string) { this.errorMsg.set(msg); this.stage.set('error'); this._stopProgress(); }

  private _startProgress() {
    this.extractionProgress.set(0); let v = 0;
    this._progressTimer = setInterval(() => {
      if (v < 85) { v += Math.random() * 6 + 2; this.extractionProgress.set(Math.min(v, 85)); }
    }, 300);
  }

  private _stopProgress() { clearInterval(this._progressTimer); this.extractionProgress.set(100); }

  private _startThinking() {
    this.thinkingStep.set(0);
    this._thinkingTimer = setInterval(() => {
      this.thinkingStep.update(s =>
        s < this.thinkingMessages.length - 1 ? s + 1 : s
      );
    }, 2400);
  }

  private _stopThinking() {
    clearInterval(this._thinkingTimer);
    this.thinkingStep.set(this.thinkingMessages.length - 1);
  }

  formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1048576) return `${(bytes/1024).toFixed(0)} Ko`;
    return `${(bytes/1048576).toFixed(1)} Mo`;
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}

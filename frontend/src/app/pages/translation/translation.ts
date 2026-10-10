import {
  Component, signal, computed, inject, OnDestroy,
  ElementRef, ViewChild, HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  TranslationService,
  TranslateResponse,
  SimplifyResponse,
  LANGUAGES,
  SIMPLIFY_LEVELS,
} from '../../services/translation.service';
import { UiIcon } from '../../components/ui-icon/ui-icon';

type MainTab  = 'translate' | 'simplify';
type TrlStage = 'idle' | 'loading' | 'done' | 'error';

const THINKING_TRANSLATE = [
  'Extraction du contenu…',
  'Identification de la terminologie juridique…',
  'Traduction des articles et clauses…',
  'Préservation de la structure légale…',
  'Construction du glossaire juridique…',
  'Vérification de la fidélité de la traduction…',
  'Finalisation…',
];

const THINKING_SIMPLIFY = [
  'Extraction du contenu…',
  'Analyse de la complexité juridique…',
  'Identification des termes clés…',
  'Reformulation en langage accessible…',
  'Extraction des points importants…',
  'Rédaction du résumé…',
  'Finalisation…',
];

@Component({
  selector:    'app-translation',
  imports:     [CommonModule, FormsModule, UiIcon],
  templateUrl: './translation.html',
  styleUrl:    './translation.scss',
})
export class Translation implements OnDestroy {
  private svc = inject(TranslationService);

  @ViewChild('trlFileInput') trlFileRef!: ElementRef<HTMLInputElement>;
  @ViewChild('splFileInput') splFileRef!: ElementRef<HTMLInputElement>;

  readonly LANGUAGES       = LANGUAGES;
  readonly SIMPLIFY_LEVELS = SIMPLIFY_LEVELS;

  // ── Tabs ──────────────────────────────────────────────────────────────────
  activeTab = signal<MainTab>('translate');

  // ── Traduction ────────────────────────────────────────────────────────────
  trlStage      = signal<TrlStage>('idle');
  trlError      = signal<string>('');
  trlResult     = signal<TranslateResponse | null>(null);
  trlText       = signal<string>('');
  trlFile       = signal<File | null>(null);
  trlMode       = signal<'text' | 'file'>('text');
  trlSourceLang = signal<string>('fr');
  trlTargetLang = signal<string>('en');
  trlTransMode  = signal<string>('professional');  // professional | literal
  trlDrag       = signal<boolean>(false);
  trlCopied     = signal<boolean>(false);
  showGlossary  = signal<boolean>(true);

  // ── Vulgarisation ─────────────────────────────────────────────────────────
  splStage  = signal<TrlStage>('idle');
  splError  = signal<string>('');
  splResult = signal<SimplifyResponse | null>(null);
  splText   = signal<string>('');
  splFile   = signal<File | null>(null);
  splMode   = signal<'text' | 'file'>('text');
  splLevel  = signal<string>('public');
  splDrag   = signal<boolean>(false);
  splCopied = signal<boolean>(false);

  // ── Thinking animation ────────────────────────────────────────────────────
  thinkingMessages: string[] = [];
  thinkingStep = signal<number>(0);
  private _timer?: ReturnType<typeof setInterval>;

  // ── Computed ──────────────────────────────────────────────────────────────
  readonly trlValid = computed(() =>
    this.trlMode() === 'text'
      ? this.trlText().trim().length > 10 && this.trlSourceLang() !== this.trlTargetLang()
      : !!this.trlFile() && this.trlSourceLang() !== this.trlTargetLang()
  );

  readonly splValid = computed(() =>
    this.splMode() === 'text' ? this.splText().trim().length > 10 : !!this.splFile()
  );

  readonly availableTargets = computed(() =>
    LANGUAGES.filter(l => l.code !== this.trlSourceLang())
  );

  readonly sourceLangLabel = computed(() =>
    LANGUAGES.find(l => l.code === this.trlSourceLang())?.label ?? ''
  );

  readonly targetLangLabel = computed(() =>
    LANGUAGES.find(l => l.code === this.trlTargetLang())?.label ?? ''
  );

  readonly targetIsLocal = computed(() => {
    const t = LANGUAGES.find(l => l.code === this.trlTargetLang());
    return t?.local ?? false;
  });

  readonly selectedLevel = computed(() =>
    SIMPLIFY_LEVELS.find(l => l.value === this.splLevel()) ?? SIMPLIFY_LEVELS[0]
  );

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  ngOnDestroy() { this._stopThinking(); }

  // ── Tab ───────────────────────────────────────────────────────────────────
  switchTab(tab: MainTab) { this.activeTab.set(tab); }

  // ── Traduction ────────────────────────────────────────────────────────────
  setSourceLang(lang: string) {
    this.trlSourceLang.set(lang);
    if (this.trlTargetLang() === lang) {
      const other = LANGUAGES.find(l => l.code !== lang);
      if (other) this.trlTargetLang.set(other.code);
    }
  }

  swapLanguages() {
    const src = this.trlSourceLang();
    const tgt = this.trlTargetLang();
    const localLangs = ['pular', 'malinke', 'soussou'];
    if (localLangs.includes(src)) return; // local langs can't be source
    this.trlSourceLang.set(tgt);
    this.trlTargetLang.set(src);
  }

  openTrlFile() { this.trlFileRef?.nativeElement?.click(); }
  openSplFile() { this.splFileRef?.nativeElement?.click(); }

  onTrlFileSelected(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this._setTrlFile(f);
  }
  onSplFileSelected(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0];
    if (f) this._setSplFile(f);
  }

  private _setTrlFile(f: File) {
    if (f.type !== 'application/pdf' && !f.name.endsWith('.pdf')) {
      this.trlError.set('Seuls les PDF sont acceptés.'); return;
    }
    if (f.size > 25 * 1024 * 1024) { this.trlError.set('Max 25 Mo.'); return; }
    this.trlError.set('');
    this.trlFile.set(f);
  }

  private _setSplFile(f: File) {
    if (f.type !== 'application/pdf' && !f.name.endsWith('.pdf')) {
      this.splError.set('Seuls les PDF sont acceptés.'); return;
    }
    if (f.size > 25 * 1024 * 1024) { this.splError.set('Max 25 Mo.'); return; }
    this.splError.set('');
    this.splFile.set(f);
  }

  @HostListener('dragover', ['$event'])
  onDragOver(e: DragEvent) { e.preventDefault(); }

  onDropTrl(e: DragEvent) {
    e.preventDefault(); this.trlDrag.set(false);
    const f = e.dataTransfer?.files[0]; if (f) this._setTrlFile(f);
  }
  onDropSpl(e: DragEvent) {
    e.preventDefault(); this.splDrag.set(false);
    const f = e.dataTransfer?.files[0]; if (f) this._setSplFile(f);
  }

  translate() {
    if (!this.trlValid()) return;
    this.trlStage.set('loading');
    this.trlError.set('');
    this.trlResult.set(null);
    this._startThinking(THINKING_TRANSLATE);

    const file = this.trlMode() === 'file' ? this.trlFile() : null;

    this.svc.translate(
      this.trlText(), this.trlSourceLang(), this.trlTargetLang(), this.trlTransMode(), file,
    ).subscribe({
      next: res => {
        this._stopThinking();
        this.trlResult.set(res);
        this.trlStage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.trlError.set(err.error?.detail ?? 'Erreur lors de la traduction.');
        this.trlStage.set('error');
      },
    });
  }

  simplify() {
    if (!this.splValid()) return;
    this.splStage.set('loading');
    this.splError.set('');
    this.splResult.set(null);
    this._startThinking(THINKING_SIMPLIFY);

    const file = this.splMode() === 'file' ? this.splFile() : null;

    this.svc.simplify(this.splText(), this.splLevel(), file).subscribe({
      next: res => {
        this._stopThinking();
        this.splResult.set(res);
        this.splStage.set('done');
      },
      error: err => {
        this._stopThinking();
        this.splError.set(err.error?.detail ?? 'Erreur lors de la vulgarisation.');
        this.splStage.set('error');
      },
    });
  }

  resetTranslate() {
    this.trlStage.set('idle'); this.trlError.set(''); this.trlResult.set(null);
    this.trlText.set(''); this.trlFile.set(null); this.trlMode.set('text');
    this._stopThinking();
  }

  resetSimplify() {
    this.splStage.set('idle'); this.splError.set(''); this.splResult.set(null);
    this.splText.set(''); this.splFile.set(null); this.splMode.set('text');
    this._stopThinking();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  async copyTrl() {
    try {
      await navigator.clipboard.writeText(this.trlResult()?.translated_text ?? '');
      this.trlCopied.set(true);
      setTimeout(() => this.trlCopied.set(false), 2000);
    } catch {}
  }

  async copySpl() {
    try {
      await navigator.clipboard.writeText(this.splResult()?.simplified_text ?? '');
      this.splCopied.set(true);
      setTimeout(() => this.splCopied.set(false), 2000);
    } catch {}
  }

  downloadTrl() {
    const res = this.trlResult();
    if (!res) return;
    const blob = new Blob([res.translated_text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `traduction_${this.trlTargetLang()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  downloadSpl() {
    const res = this.splResult();
    if (!res) return;
    const blob = new Blob([res.simplified_text], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `texte_simplifie.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  fileSizeLabel(bytes: number): string {
    if (bytes < 1024) return `${bytes} o`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  }

  langFlag(code: string): string {
    return LANGUAGES.find(l => l.code === code)?.flag ?? 'globe';
  }

  isLangIcon(code: string): boolean {
    return this.langFlag(code) === 'globe';
  }

  levelIcon(value: string): string {
    return ({ public: 'users', professionnel: 'briefcase', etudiant: 'book' } as Record<string, string>)[value] ?? 'users';
  }

  langLabel(code: string): string {
    return LANGUAGES.find(l => l.code === code)?.label ?? code;
  }

  private _startThinking(messages: string[]) {
    this.thinkingMessages = messages;
    this.thinkingStep.set(0);
    this._timer = setInterval(() => {
      this.thinkingStep.update(s => s < messages.length - 1 ? s + 1 : s);
    }, 2400);
  }

  private _stopThinking() {
    clearInterval(this._timer);
    if (this.thinkingMessages.length > 0)
      this.thinkingStep.set(this.thinkingMessages.length - 1);
  }
}

import {
  Component, signal, OnDestroy,
  ViewChild, ElementRef, AfterViewChecked, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import { ConversationHistoryService, UsageInfo, ThinkingStep } from '../../services/conversation-history';
import { MarkdownPipe, docLabel, shortRef } from '../../pipes/markdown.pipe';

export interface Message {
  id: string;
  content: string;
  sender: 'user' | 'bot';
  timestamp: Date;
  sources?: any[];
  /** Étapes de réflexion parcourues (messages de la session en cours) */
  steps?: ThinkingStep[];
  thinkingMs?: number;
}

/** Étape affichée immédiatement, avant la première réponse du suivi. */
const FIRST_STEP: ThinkingStep = { id: 'analyse', label: 'Analyse de la question', status: 'active' };

export interface GroupedSource {
  nom_doc: string;
  count: number;
  refs: string;
}

@Component({
  selector: 'app-conversation',
  imports: [CommonModule, FormsModule, RouterLink, MarkdownPipe],
  templateUrl: './conversation.html',
  styleUrl: './conversation.scss',
})
export class Conversation implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') private messagesContainer!: ElementRef;

  messages              = signal<Message[]>([]);
  inputMessage          = signal('');
  isLoading             = signal(false);
  showTooltip           = signal(false);
  historyCount          = signal(0);
  currentConversationId = signal<string | null>(null);
  errorMessage          = signal('');
  copiedMessageId       = signal<string | null>(null);

  /** Réflexion en direct (pendant l'attente) */
  thinkingSteps   = signal<ThinkingStep[]>([]);
  thinkingSeconds = signal(0);
  /** Réflexions dépliées (après réponse) et articles dépliés, par clé */
  openThinking = signal<Set<string>>(new Set());
  openArticles = signal<Set<string>>(new Set());
  private progressTimer: any;
  private clockTimer: any;
  private thinkingStartedAt = 0;

  readonly suggestedQuestions = [
    { domain: 'Droit du travail', text: 'Quels sont mes droits en cas de licenciement sans motif valable ?' },
    { domain: 'Famille',          text: 'Quelles sont les causes légales de divorce en Guinée ?' },
    { domain: 'Pénal',            text: 'Quels sont les droits d\'une personne placée en garde à vue ?' },
    { domain: 'Affaires',         text: 'Quelles formalités pour créer une société en Guinée ?' },
  ];

  aiName         = signal(localStorage.getItem('currentAiName') || 'JusticIA');
  currentAgentId = signal(localStorage.getItem('currentAgentId') || 'jurisprudence');

  // Quota
  usage              = signal<UsageInfo | null>(null);
  showLimitModal     = signal(false);
  limitModalMessage  = signal('');

  private shouldScrollToBottom = false;
  private historyCountInterval: any;
  private usageInterval: any;

  constructor(
    private historyService: ConversationHistoryService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.historyCountInterval = setInterval(() => {
      this.historyService.getHistory().subscribe(h => this.historyCount.set(h.length));
    }, 5000);

    // Rafraîchir le quota toutes les 30 secondes
    this.usageInterval = setInterval(() => this.loadUsage(), 30000);
  }

  ngOnInit() {
    this.historyService.getHistory().subscribe(h => this.historyCount.set(h.length));
    this.loadUsage();

    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.loadConversationFromHistory(id);
      }
    });

    // Question préparée depuis une autre page (article, décision, démarche) :
    // pré-remplie dans le champ, jamais envoyée sans l'accord de l'utilisateur.
    const q = this.route.snapshot.queryParamMap.get('q');
    if (q && !this.route.snapshot.params['id']) {
      this.inputMessage.set(q.slice(0, 2000));
      this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  ngAfterViewChecked() {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }
  }

  ngOnDestroy() {
    if (this.historyCountInterval) clearInterval(this.historyCountInterval);
    if (this.usageInterval)        clearInterval(this.usageInterval);
    this.stopThinking();
  }

  private loadUsage() {
    this.historyService.getUsage().subscribe(u => {
      this.usage.set(u);
      // Si la limite est atteinte et qu'on a pas encore le modal ouvert, rien de spécial ici
    });
  }

  isLimitReached(): boolean {
    const u = this.usage();
    if (!u || u.is_unlimited) return false;
    return u.remaining <= 0;
  }

  getQuotaPercent(): number {
    const u = this.usage();
    if (!u || u.is_unlimited || u.daily_limit <= 0) return 0;
    return Math.min(100, Math.round((u.questions_today / u.daily_limit) * 100));
  }

  /** Libellé complet du quota pour les lecteurs d'écran (le visuel est abrégé sur mobile). */
  quotaLabel(): string {
    const u = this.usage();
    if (!u) return '';
    if (u.is_unlimited) return 'Questions illimitées';
    if (this.isLimitReached()) return `Limite du jour atteinte (${u.daily_limit} questions)`;
    return `${u.remaining} questions restantes sur ${u.daily_limit} aujourd'hui`;
  }

  // ── Envoi d'un message ────────────────────────────────────────────────────
  sendMessage() {
    const content = this.inputMessage().trim();
    if (!content || this.isLoading()) return;
    this.inputMessage.set('');
    this.sendMessageContent(content);
  }

  sendSuggestedQuestion(question: string) {
    if (this.isLoading()) return;
    setTimeout(() => {
      this.inputMessage.set('');
      this.sendMessageContent(question);
    }, 0);
  }

  private sendMessageContent(content: string) {
    this.errorMessage.set('');

    const userMsg: Message = {
      id: Date.now().toString(),
      content,
      sender: 'user',
      timestamp: new Date(),
    };
    this.messages.update(msgs => [...msgs, userMsg]);
    this.shouldScrollToBottom = true;
    this.isLoading.set(true);
    const requestId = newRequestId();
    this.startThinking(requestId);

    this.historyService
      .sendMessage(content, this.currentAgentId(), this.currentConversationId(), requestId)
      .subscribe({
        next: (resp: any) => {
          if (resp.conversation_id) {
            this.currentConversationId.set(resp.conversation_id);
          }

          const botMsg: Message = {
            id: resp.id || (Date.now() + 1).toString(),
            content: resp.content,
            sender: 'bot',
            timestamp: new Date(resp.created_at || Date.now()),
            sources: resp.sources || [],
            steps: (resp.steps && resp.steps.length ? resp.steps : this.thinkingSteps())
              .map((st: ThinkingStep) => ({ ...st, status: 'done' as const })),
            thinkingMs: resp.thinking_ms || Date.now() - this.thinkingStartedAt,
          };
          this.stopThinking();
          this.messages.update(msgs => [...msgs, botMsg]);
          this.isLoading.set(false);
          this.shouldScrollToBottom = true;

          // Mettre à jour compteurs
          this.historyService.getHistory().subscribe(h => this.historyCount.set(h.length));
          this.loadUsage();
        },
        error: (err) => {
          this.isLoading.set(false);
          this.stopThinking();

          // Retirer le message utilisateur de l'affichage si limite atteinte
          const detail = err.error?.detail;

          if (err.status === 429 || detail?.code === 'DAILY_LIMIT_REACHED') {
            // Supprimer le dernier message utilisateur (non envoyé)
            this.messages.update(msgs => msgs.slice(0, -1));
            this.limitModalMessage.set(
              detail?.message || 'Vous avez atteint votre limite de questions pour aujourd\'hui.'
            );
            this.showLimitModal.set(true);
            this.loadUsage();
          } else {
            const msg = typeof detail === 'string'
              ? detail
              : detail?.message || 'Une erreur est survenue. Veuillez réessayer.';
            this.errorMessage.set(msg);
          }
        },
      });
  }

  // ── Réflexion en direct ───────────────────────────────────────────────────
  private startThinking(requestId: string) {
    this.stopThinking();
    this.thinkingStartedAt = Date.now();
    this.thinkingSeconds.set(0);
    this.thinkingSteps.set([FIRST_STEP]);
    this.clockTimer = setInterval(
      () => this.thinkingSeconds.set(Math.floor((Date.now() - this.thinkingStartedAt) / 1000)), 250);
    const poll = () => {
      this.historyService.getProgress(requestId).subscribe(p => {
        if (!this.isLoading()) return;
        if (p?.steps?.length) {
          this.thinkingSteps.set(p.steps);
          this.shouldScrollToBottom = true;
        }
        this.progressTimer = setTimeout(poll, 650);
      });
    };
    this.progressTimer = setTimeout(poll, 350);
  }

  private stopThinking() {
    clearTimeout(this.progressTimer);
    clearInterval(this.clockTimer);
    this.progressTimer = this.clockTimer = undefined;
  }

  thinkingLabel(message: Message): string {
    const s = Math.max(1, Math.round((message.thinkingMs || 0) / 1000));
    return `Réflexion terminée en ${s} s`;
  }

  toggleSet(sig: typeof this.openThinking, key: string) {
    sig.update(set => {
      const next = new Set(set);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  // ── Articles cités ────────────────────────────────────────────────────────
  citedSources(message: Message): any[] {
    return (message.sources || []).filter(s => s?.cite_no && s.kind !== 'decision').sort((a, b) => a.cite_no - b.cite_no);
  }

  otherSources(message: Message): any[] {
    const articles = (message.sources || []).filter(s => s?.kind !== 'decision');
    if (!this.citedSources(message).length) return articles;
    return articles.filter(s => !s?.cite_no);
  }

  /** Décisions de justice jointes à la réponse : citées d'abord ([J1]…), puis consultées. */
  decisionSources(message: Message): any[] {
    return (message.sources || []).filter(s => s?.kind === 'decision')
      .sort((a, b) => (a.cite_no ?? 99) - (b.cite_no ?? 99));
  }

  articleKey(message: Message, n: number) { return `${message.id}:${n}`; }

  /** Clic sur un renvoi [n] dans la réponse : ouvre l'article et le fait défiler à l'écran. */
  onAnswerClick(event: Event, message: Message) {
    const juris = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-juris]');
    if (juris) {
      const el = document.getElementById(`dec-${message.id}-${juris.dataset['juris']}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el?.classList.add('is-flash');
      setTimeout(() => el?.classList.remove('is-flash'), 1200);
      return;
    }
    const btn = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-cite]');
    if (!btn) return;
    const n = Number(btn.dataset['cite']);
    const key = this.articleKey(message, n);
    this.openArticles.update(set => new Set(set).add(key));
    setTimeout(() => {
      const el = document.getElementById('art-' + key.replace(':', '-'));
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el?.classList.add('is-flash');
      setTimeout(() => el?.classList.remove('is-flash'), 1200);
    }, 30);
  }

  readonly docLabel = docLabel;
  readonly shortRef = shortRef;

  goToAbonnement() {
    this.showLimitModal.set(false);
    this.router.navigate(['/dashboard/subscription']);
  }

  // ── Charger une conversation depuis l'historique ──────────────────────────
  private loadConversationFromHistory(id: string) {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.historyService.getConversationById(id).subscribe({
      next: (conv: any) => {
        this.isLoading.set(false);
        if (!conv) {
          this.errorMessage.set('Impossible de charger cette conversation.');
          return;
        }
        this.currentConversationId.set(id);
        this.aiName.set(conv.ai_name || 'JusticIA');
        this.currentAgentId.set(conv.agent_id || 'jurisprudence');

        const msgs: Message[] = (conv.messages || []).map((m: any) => ({
          id: String(m.id || Date.now()),
          content: m.content || '',
          sender: (m.sender === 'user' ? 'user' : 'bot') as 'user' | 'bot',
          timestamp: new Date(m.created_at || Date.now()),
          sources: Array.isArray(m.sources) ? m.sources : [],
        }));

        this.messages.set(msgs);
        this.shouldScrollToBottom = true;
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Erreur lors du chargement de la conversation.');
      },
    });
  }

  clearConversation() {
    this.messages.set([]);
    this.currentConversationId.set(null);
    this.errorMessage.set('');
  }

  private scrollToBottom(): void {
    try {
      if (this.messagesContainer?.nativeElement) {
        const el = this.messagesContainer.nativeElement;
        el.scrollTop = el.scrollHeight;
      }
    } catch {}
  }

  formatTime(date: Date): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  /** Regroupe les sources par document — le RAG cite souvent plusieurs
   * articles distincts du même texte de loi, qui s'affichaient avant comme
   * autant de puces identiques ("NOUVEAU CODE DE TRAVAIL 2014" x10). */
  groupSources(sources: any[] | undefined): GroupedSource[] {
    if (!sources?.length) return [];
    const byDoc = new Map<string, string[]>();
    for (const s of sources) {
      const doc = docLabel(s.nom_doc) || s.article_ref || 'Source';
      const ref = s.article_ref || s.numero || '';
      const refs = byDoc.get(doc) ?? byDoc.set(doc, []).get(doc)!;
      if (ref && !refs.includes(ref)) refs.push(ref);
    }
    return Array.from(byDoc.entries()).map(([nom_doc, refs]) => ({
      nom_doc,
      count: refs.length,
      refs: refs.join(', '),
    }));
  }

  async copyMessage(message: Message) {
    let text = message.sender === 'bot'
      ? message.content.replace(/<[^>]+>/g, '').trim()
      : message.content;
    const cited = message.sender === 'bot' ? this.citedSources(message) : [];
    if (cited.length) {
      text += '\n\nArticles cités\n' + cited
        .map(s => `[${s.cite_no}] ${docLabel(s.nom_doc)} — ${s.article_ref}\n« ${String(s.texte || '').trim()} »`)
        .join('\n\n');
    }
    const decs = message.sender === 'bot' ? this.decisionSources(message).filter(d => d.cite_no) : [];
    if (decs.length) {
      text += '\n\nJurisprudence\n' + decs.map(d => `[J${d.cite_no}] ${d.article_ref}${d.source_url ? ' — ' + d.source_url : ''}`).join('\n');
    }
    try {
      await navigator.clipboard.writeText(text);
      this.copiedMessageId.set(message.id);
      setTimeout(() => this.copiedMessageId.set(null), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this.copiedMessageId.set(message.id);
      setTimeout(() => this.copiedMessageId.set(null), 2000);
    }
  }
}

/** Identifiant de suivi de la réflexion (envoyé avec la question). */
function newRequestId(): string {
  const c: any = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  return Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
}

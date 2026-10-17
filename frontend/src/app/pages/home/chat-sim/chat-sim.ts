import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { CodexArticle, DEMO_QUESTIONS, articleById } from './demo-articles';

interface ChatMsg {
  id: number;
  from: 'user' | 'bot';
  kind: 'text' | 'answer' | 'signin';
  text: string;          // texte affiché (s'écrit progressivement pour le bot)
  article?: CodexArticle;
  done: boolean;         // réponse terminée → citation visible
}

/** Étapes du raisonnement affichées pendant la « réflexion » (reflète le vrai pipeline RAG). */
interface Thinking {
  steps: string[];
  current: number;       // index de l'étape en cours ; steps.length = toutes terminées
}

const PIPELINE = (domain: string): string[] => [
  'Compréhension de la question',
  `Recherche dans 12\u00a0282 articles · ${domain}`,
  'Tri par pertinence juridique',
  'Rédaction, citation mot pour mot',
];

/** Questions jouées automatiquement tant que le visiteur n'a pas touché au chat. */
const AUTOPLAY = [DEMO_QUESTIONS[0], DEMO_QUESTIONS[6], DEMO_QUESTIONS[4]];

/** Chat de démonstration de l'accueil : questions et réponses préparées à l'avance,
 *  aucun appel au backend. Une question saisie librement invite à se connecter. */
@Component({
  selector: 'app-chat-sim',
  imports: [FormsModule, RouterLink],
  templateUrl: './chat-sim.html',
  styleUrl: './chat-sim.scss',
})
export class ChatSim implements AfterViewInit, OnDestroy {
  @ViewChild('scroller') scroller?: ElementRef<HTMLElement>;
  @ViewChild('field') field?: ElementRef<HTMLInputElement>;

  readonly questions = DEMO_QUESTIONS;
  readonly messages = signal<ChatMsg[]>([{
    id: 0, from: 'bot', kind: 'text', done: true,
    text: 'Bonjour. Posez-moi une question de droit guinéen : je vous réponds en citant l\'article exact.',
  }]);
  readonly thinking = signal<Thinking | null>(null);
  readonly busy = signal(false);
  /** Identifiants des articles déjà cités (les suggestions correspondantes sont cochées). */
  readonly asked = signal<Set<string>>(new Set());
  /** Nombre de citations vérifiées dans la conversation (compteur de l'en-tête). */
  readonly cited = computed(() => this.messages().filter(m => m.kind === 'answer' && m.done).length);
  draft = '';

  private nextId = 1;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private touched = false;
  private autoIndex = 0;
  private readonly reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  ngAfterViewInit() {
    // Démonstration automatique : une première question, puis d'autres tant que le visiteur regarde sans agir.
    this.later(this.reduceMotion ? 0 : 2200, () => this.autoplay());
  }

  ngOnDestroy() { this.timers.forEach(clearTimeout); }

  /** Question proposée : réponse préparée à l'avance. */
  ask(question: string, articleId: string) {
    if (this.busy()) return;
    const article = articleById(articleId);
    if (!article) return;
    this.push({ from: 'user', kind: 'text', text: question, done: true });
    this.respond(() => this.reply({ kind: 'answer', full: article.answer, article }), PIPELINE(article.domain));
  }

  pick(item: { q: string; articleId: string }) {
    this.touched = true;
    this.ask(item.q, item.articleId);
  }

  isAsked(id: string) { return this.asked().has(id); }

  /** Question saisie librement : la démo ne l'interprète pas, elle invite à se connecter. */
  sendTyped() {
    const q = this.draft.trim();
    if (!q || this.busy()) return;
    this.touched = true;
    this.draft = '';
    this.push({ from: 'user', kind: 'text', text: q, done: true });
    this.respond(() => this.reply({
      kind: 'signin',
      full: "Bonne question ! Pour poser vos propres questions, connectez-vous : JusticIA les confronte alors aux 12\u00a0282 articles indexés et vous répond, sources à l'appui. Ici, vous pouvez essayer l'une des questions proposées.",
    }), ['JusticIA écrit…']);
  }

  /** Marque le chat comme « utilisé » dès que le visiteur interagit (arrête la démo automatique). */
  onTouch() { this.touched = true; }

  // ── Démo automatique ──────────────────────────────────────────────────────
  private autoplay() {
    if (this.touched || this.autoIndex >= AUTOPLAY.length) return;
    if (document.visibilityState === 'hidden') { this.later(1500, () => this.autoplay()); return; }
    const item = AUTOPLAY[this.autoIndex++];
    this.ask(item.q, item.articleId);
    // Prochaine question une fois la réponse lue (si toujours sans interaction, max 3 au total)
    this.later(this.reduceMotion ? 1200 : 9000, () => this.autoplay());
  }

  // ── Mécanique de réponse ──────────────────────────────────────────────────
  private respond(reply: () => void, steps: string[]) {
    this.busy.set(true);
    if (this.reduceMotion) { reply(); return; }
    const perStep = steps.length > 1 ? 420 : 600;
    this.thinking.set({ steps, current: 0 });
    this.scrollDown();
    steps.forEach((_, i) => {
      if (i === 0) return;
      this.later(i * perStep, () => { this.thinking.update(t => (t ? { ...t, current: i } : t)); this.scrollDown(); });
    });
    this.later(steps.length * perStep + 260, () => { this.thinking.set(null); reply(); });
  }

  private reply(r: { kind: 'answer' | 'signin'; full: string; article?: CodexArticle }) {
    const msg = this.push({ from: 'bot', kind: r.kind, text: '', article: r.article, done: false });
    const finish = () => {
      this.update(msg.id, { text: r.full, done: true });
      if (r.article) this.asked.update(s => new Set(s).add(r.article!.id));
      this.busy.set(false);
      this.scrollDown();
      // La citation / les boutons s'affichent juste après : on redescend une fois rendus
      this.later(80, () => this.scrollDown());
      this.later(700, () => this.scrollDown());
    };
    if (this.reduceMotion) { finish(); return; }
    const words = r.full.split(' ');
    words.forEach((_, i) => this.later(i * 30, () => {
      this.update(msg.id, { text: words.slice(0, i + 1).join(' ') });
      if (i % 6 === 0) this.scrollDown();
    }));
    this.later(words.length * 30 + 120, finish);
  }

  private push(m: Omit<ChatMsg, 'id'>): ChatMsg {
    const msg = { ...m, id: this.nextId++ };
    this.messages.update(list => [...list, msg].slice(-12));
    this.scrollDown();
    return msg;
  }

  private update(id: number, patch: Partial<ChatMsg>) {
    this.messages.update(list => list.map(m => (m.id === id ? { ...m, ...patch } : m)));
  }

  private scrollDown() {
    setTimeout(() => {
      const el = this.scroller?.nativeElement;
      // Défilement instantané : fiable pendant l'écriture mot à mot (le lissé est
      // interrompu à chaque mise à jour et peut ne jamais atteindre le bas).
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private later(ms: number, fn: () => void) { this.timers.push(setTimeout(fn, ms)); }
}

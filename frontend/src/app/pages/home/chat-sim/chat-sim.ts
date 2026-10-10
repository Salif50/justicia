import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, signal } from '@angular/core';
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

const FIRST = DEMO_QUESTIONS[0];

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
    text: 'Bonjour. Choisissez une question ci-dessous : je vous réponds en citant l\'article exact.',
  }]);
  readonly thinking = signal<string | null>(null);
  readonly busy = signal(false);
  draft = '';

  private nextId = 1;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private touched = false;
  private readonly reduceMotion =
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  ngAfterViewInit() {
    // Une seule démonstration automatique, si le visiteur n'a encore rien fait.
    this.later(this.reduceMotion ? 0 : 2400, () => { if (!this.touched) this.ask(FIRST.q, FIRST.articleId); });
  }

  ngOnDestroy() { this.timers.forEach(clearTimeout); }

  /** Question proposée : réponse préparée à l'avance. */
  ask(question: string, articleId: string) {
    if (this.busy()) return;
    const article = articleById(articleId);
    if (!article) return;
    this.push({ from: 'user', kind: 'text', text: question, done: true });
    this.respond(() => this.reply({ kind: 'answer', full: article.answer, article }),
                 `Recherche dans 12\u00a0282 articles · ${article.domain}`);
  }

  pick(item: { q: string; articleId: string }) {
    this.touched = true;
    this.ask(item.q, item.articleId);
  }

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
    }), null);
  }

  private respond(reply: () => void, thinking: string | null) {
    this.busy.set(true);
    if (this.reduceMotion) { reply(); return; }
    this.thinking.set(thinking ?? 'JusticIA écrit…');
    this.scrollDown();
    this.later(thinking ? 1100 : 600, () => { this.thinking.set(null); reply(); });
  }

  private reply(r: { kind: 'answer' | 'signin'; full: string; article?: CodexArticle }) {
    const msg = this.push({ from: 'bot', kind: r.kind, text: '', article: r.article, done: false });
    const finish = () => {
      this.update(msg.id, { text: r.full, done: true });
      this.busy.set(false);
      this.scrollDown();
      // La citation / les boutons s'affichent juste après : on redescend une fois rendus
      this.later(80, () => this.scrollDown());
    };
    if (this.reduceMotion) { finish(); return; }
    const words = r.full.split(' ');
    words.forEach((_, i) => this.later(i * 32, () => {
      this.update(msg.id, { text: words.slice(0, i + 1).join(' ') });
      if (i % 6 === 0) this.scrollDown();
    }));
    this.later(words.length * 32 + 120, finish);
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
      if (el) el.scrollTo({ top: el.scrollHeight, behavior: this.reduceMotion ? 'auto' : 'smooth' });
    });
  }

  private later(ms: number, fn: () => void) { this.timers.push(setTimeout(fn, ms)); }
}

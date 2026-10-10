import { Component, DestroyRef, effect, inject, input, signal } from '@angular/core';

/** Références réellement indexées (cf. chat-sim/demo-articles.ts) : rien d'inventé. */
const REFS = ['Art. 121.6', 'Art. 172.23', 'Art. 241', 'Art. 153.1', 'Art. 122.3', 'Art. 142.12'];

/** Sous ce délai, la navigation est jugée instantanée : pas de barre. */
const BAR_DELAY = 120;
/** Au-delà de ce délai, le sceau plein écran apparaît. */
const OVERLAY_DELAY = 450;
/** Une fois visible, le sceau reste au moins ce temps (évite le clignotement). */
const OVERLAY_MIN = 520;

type BarState = 'idle' | 'run' | 'done';

@Component({
  selector: 'app-loader',
  standalone: true,
  templateUrl: './loader.component.html',
  styleUrl: './loader.component.scss',
})
export class LoaderComponent {
  active = input<boolean>(false);

  protected readonly bar = signal<BarState>('idle');
  protected readonly overlay = signal(false);
  protected readonly refIndex = signal(0);
  protected readonly refs = REFS;

  private timers: ReturnType<typeof setTimeout>[] = [];
  private ticker?: ReturnType<typeof setInterval>;
  private overlayShownAt = 0;

  constructor() {
    effect(() => (this.active() ? this.start() : this.stop()));
    inject(DestroyRef).onDestroy(() => this.clear());
  }

  private start(): void {
    this.clear();
    this.later(BAR_DELAY, () => this.bar.set('run'));
    this.later(OVERLAY_DELAY, () => {
      this.overlay.set(true);
      this.overlayShownAt = performance.now();
      this.ticker = setInterval(() => this.refIndex.update(i => (i + 1) % REFS.length), 900);
    });
  }

  private stop(): void {
    this.clear();
    if (this.bar() === 'run') {
      this.bar.set('done');
      this.later(420, () => this.bar.set('idle'));
    } else {
      this.bar.set('idle');
    }
    if (this.overlay()) {
      const wait = Math.max(0, OVERLAY_MIN - (performance.now() - this.overlayShownAt));
      this.later(wait, () => this.overlay.set(false));
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(setTimeout(fn, ms));
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    if (this.ticker) clearInterval(this.ticker);
    this.ticker = undefined;
  }
}

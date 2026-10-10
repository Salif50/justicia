import { Component, computed, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Auth } from '../../services/auth';
import { environment } from '../../../environments/environment';
import { PROFILE_TYPES, ProfileType } from '../../shared/profile-types';
import { DOMAINS, SOURCES, USAGES } from '../../shared/survey-options';

type Step = 'profile' | 'domains' | 'usage' | 'details' | 'source' | 'done';

const STEPS: { key: Exclude<Step, 'done'>; title: string; label: string }[] = [
  { key: 'profile', label: 'Profil',       title: 'Qui êtes-vous\u00A0?' },
  { key: 'domains', label: 'Domaines',     title: 'Quels domaines du droit vous concernent\u00A0?' },
  { key: 'usage',   label: 'Usage',        title: 'Qu\'attendez-vous principalement de JusticIA\u00A0?' },
  { key: 'details', label: 'Coordonnées',  title: 'Quelques informations pour personnaliser votre espace' },
  { key: 'source',  label: 'Découverte',   title: 'Comment avez-vous connu JusticIA\u00A0?' },
];

@Component({
  selector: 'app-onboarding-survey',
  imports: [CommonModule],
  templateUrl: './onboarding-survey.html',
  styleUrl: './onboarding-survey.scss',
})
export class OnboardingSurvey {
  private auth   = inject(Auth);
  private http   = inject(HttpClient);
  private router = inject(Router);

  readonly closed = output<void>();

  readonly steps        = STEPS;
  readonly profileTypes = PROFILE_TYPES;
  readonly domainChoices = DOMAINS;
  readonly usageChoices  = USAGES;
  readonly sourceChoices = SOURCES;

  readonly step = signal<Step>('profile');

  readonly profile = signal<ProfileType | null>(null);
  readonly domains = signal<string[]>([]);
  readonly usage   = signal<string | null>(null);
  readonly source  = signal<string | null>(null);

  readonly name         = signal(this.auth.user()?.name ?? '');
  readonly organization = signal('');
  readonly city         = signal('');
  readonly phone        = signal('');
  readonly barNumber    = signal('');

  readonly saving = signal(false);
  readonly error  = signal('');

  readonly stepIndex = computed(() => STEPS.findIndex(s => s.key === this.step()));
  readonly current   = computed(() => STEPS[this.stepIndex()] ?? null);
  readonly firstName = computed(() => (this.name().trim().split(' ')[0]) || '');

  readonly canContinue = computed(() => {
    switch (this.step()) {
      case 'profile': return !!this.profile();
      case 'domains': return this.domains().length > 0;
      case 'usage':   return !!this.usage();
      case 'source':  return !!this.source();
      default:        return true;
    }
  });

  isDomain(key: string): boolean { return this.domains().includes(key); }

  toggleDomain(key: string): void {
    this.domains.update(list => list.includes(key) ? list.filter(k => k !== key) : [...list, key]);
  }

  next(): void {
    const i = this.stepIndex();
    if (i < STEPS.length - 1) {
      this.step.set(STEPS[i + 1].key);
    } else {
      this.submit(false);
    }
  }

  back(): void {
    const i = this.stepIndex();
    if (i > 0) this.step.set(STEPS[i - 1].key);
  }

  /** Passer seulement la question en cours. */
  skipQuestion(): void {
    this.next();
  }

  /** Passer tout le questionnaire. */
  skipAll(): void {
    this.submit(true);
  }

  private submit(skipped: boolean): void {
    if (this.saving()) return;
    this.saving.set(true);
    this.error.set('');

    const survey = {
      version: 1,
      skipped,
      skipped_at_step: skipped ? this.step() : null,
      domains: this.domains(),
      usage: this.usage(),
      source: this.source(),
    };

    const payload = {
      profile_type: this.profile()?.key,
      name:         this.name().trim() || undefined,
      organization: this.organization().trim() || undefined,
      city:         this.city().trim() || undefined,
      phone:        this.phone().trim() || undefined,
      bar_number:   this.barNumber().trim() || undefined,
      survey,
    };

    this.http.post(`${environment.apiUrl}/user/complete-profile`, payload).subscribe({
      next: () => this.finish(skipped),
      // Le questionnaire ne doit jamais bloquer l'accès : on ferme même en cas d'erreur réseau
      error: () => this.finish(skipped),
    });
  }

  private finish(skipped: boolean): void {
    this.auth.updateUser({
      profile_completed: true,
      ...(this.profile() ? { profile_type: this.profile()!.key } : {}),
      ...(this.name().trim() ? { name: this.name().trim() } : {}),
    });
    this.saving.set(false);
    if (skipped) {
      this.closed.emit();
    } else {
      this.step.set('done');
    }
  }

  startChat(): void {
    this.closed.emit();
    this.router.navigate(['/dashboard/chat']);
  }

  explore(): void {
    this.closed.emit();
  }
}

import { Component, signal, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { UiIcon } from '../../components/ui-icon/ui-icon';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin, catchError, of } from 'rxjs';
import { ConversationHistoryService, UsageInfo } from '../../services/conversation-history';
import { CaseService, CaseOut } from '../../services/case.service';
import { environment } from '../../../environments/environment';

interface RecentConv {
  id: string;
  title: string;
  agent_id: string;
  ai_name: string;
  message_count: number;
  updated_at: string;
}

interface AgendaEvent {
  id: string;
  title: string;
  event_type: string;
  start_at: string;
  color: string | null;
  case_name: string | null;
  status: string;
}

interface DashboardStats {
  conversationsTotal: number;
  casesTotal: number;
  casesOpen: number;
  upcomingEvents: number;
}

const AGENT_LABELS: Record<string, string> = {
  jurisprudence: 'Général',
  matrimonial:   'Famille',
  penal:         'Pénal',
  commercial:    'Commercial',
  travail:       'Travail',
  immobilier:    'Immobilier',
};

const EVENT_ICONS: Record<string, string> = {
  audience:            'scale',
  delai_recours:       'hourglass',
  delai_prescription:  'clock',
  remise_document:     'file',
  consultation:        'message',
  reunion:             'users',
  expertise:           'search',
  autre:               'pin',
};

@Component({
  selector: 'app-dashboard-home',
  imports: [CommonModule, RouterLink, UiIcon],
  templateUrl: './overview.html',
  styleUrl: './overview.scss',
})
export class Overview implements OnInit {
  private convSvc = inject(ConversationHistoryService);
  private caseSvc = inject(CaseService);
  private http    = inject(HttpClient);

  userName        = signal(localStorage.getItem('userName') || 'Utilisateur');
  currentTime     = signal(new Date());
  usage           = signal<UsageInfo | null>(null);
  recentConvs     = signal<RecentConv[]>([]);
  cases           = signal<CaseOut[]>([]);
  upcomingEvents  = signal<AgendaEvent[]>([]);
  stats           = signal<DashboardStats>({ conversationsTotal: 0, casesTotal: 0, casesOpen: 0, upcomingEvents: 0 });
  isLoading       = signal(true);

  readonly quickActions = [
    { icon: 'chat',     label: 'Nouvelle question',       route: '/dashboard/chat',          color: 'orange' },
    { icon: 'case',     label: 'Nouveau dossier',         route: '/dashboard/cases',         color: 'orange' },
    { icon: 'doc',      label: 'Résumer un document',     route: '/dashboard/summary',           color: 'orange' },
    { icon: 'generate', label: 'Générer un document',     route: '/dashboard/generation',       color: 'orange'  },
    { icon: 'agent',    label: 'Agents personnalisés',    route: '/dashboard/custom-agents', color: 'orange' },
    { icon: 'agenda',   label: 'Agenda & Échéances',      route: '/dashboard/agenda',           color: 'orange'    },
  ];

  constructor() {
    setInterval(() => this.currentTime.set(new Date()), 60000);
  }

  ngOnInit() {
    forkJoin({
      profile: this.convSvc.getUserProfile().pipe(catchError(() => of(null))),
      usage:   this.convSvc.getUsage().pipe(catchError(() => of(null))),
      history: this.convSvc.getHistory().pipe(catchError(() => of([]))),
      cases:   this.caseSvc.list().pipe(catchError(() => of([]))),
      events:  this.http.get<AgendaEvent[]>(`${environment.apiUrl}/agenda?upcoming=true`).pipe(catchError(() => of([]))),
    }).subscribe(({ profile, usage, history, cases, events }) => {
      if (profile?.name) {
        this.userName.set(profile.name);
        localStorage.setItem('userName', profile.name);
      }
      this.usage.set(usage);
      this.recentConvs.set((history as RecentConv[]).slice(0, 5));
      this.cases.set(cases);

      const upcoming = (events as AgendaEvent[])
        .filter(e => e.status === 'upcoming')
        .slice(0, 4);
      this.upcomingEvents.set(upcoming);

      this.stats.set({
        conversationsTotal: (history as any[]).length,
        casesTotal:         cases.length,
        casesOpen:          cases.length,
        upcomingEvents:     upcoming.length,
      });

      this.isLoading.set(false);
    });
  }

  getGreeting(): string {
    const h = this.currentTime().getHours();
    if (h < 12) return 'Bonjour';
    if (h < 18) return 'Bon après-midi';
    return 'Bonsoir';
  }

  formatTime(): string {
    return new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(this.currentTime());
  }

  formatDate(): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long',
    }).format(this.currentTime());
  }

  getQuotaPercent(): number {
    const u = this.usage();
    if (!u || u.is_unlimited || u.daily_limit <= 0) return 0;
    return Math.min(100, Math.round((u.questions_today / u.daily_limit) * 100));
  }

  agentLabel(id: string): string {
    return AGENT_LABELS[id] || id;
  }

  eventIcon(type: string): string {
    return EVENT_ICONS[type] || 'pin';
  }

  formatEventDate(dateStr: string): string {
    const d = new Date(dateStr);
    const today = new Date();
    const diff  = Math.floor((d.getTime() - today.getTime()) / 86400000);
    if (diff === 0) return "Aujourd'hui";
    if (diff === 1) return 'Demain';
    if (diff < 7)  return `Dans ${diff} jours`;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
  }

  formatConvDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diff < 60)   return `Il y a ${diff}min`;
    if (diff < 1440) return `Il y a ${Math.floor(diff / 60)}h`;
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(d);
  }

  isEventUrgent(dateStr: string): boolean {
    const d    = new Date(dateStr);
    const diff = Math.floor((d.getTime() - new Date().getTime()) / 86400000);
    return diff <= 2;
  }
}

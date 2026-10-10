import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { UiIcon } from '../../components/ui-icon/ui-icon';

// ── Types ──────────────────────────────────────────────────────────────────────
export interface AgendaEvent {
  id: string; title: string; description: string; location: string | null;
  event_type: string; start_at: string; end_at: string | null;
  is_all_day: boolean; reminder_days: number; color: string | null;
  status: 'upcoming' | 'done' | 'cancelled';
  case_id: string | null; case_name: string | null;
  created_at: string; updated_at: string;
}

interface AgendaStats {
  total: number; upcoming: number; overdue: number; today: number;
  next_events: AgendaEvent[];
}

interface CalendarDay {
  date: Date; isCurrentMonth: boolean; isToday: boolean;
  events: AgendaEvent[];
}

interface CaseOption { id: string; name: string; }

// ── Config types ───────────────────────────────────────────────────────────────
export const EVENT_TYPES: { value: string; label: string; icon: string; color: string }[] = [
  { value: 'audience',          label: 'Audience',            icon: 'scale',     color: '#7c3aed' },
  { value: 'delai_recours',     label: 'Délai de recours',    icon: 'hourglass', color: '#dc2626' },
  { value: 'delai_prescription',label: 'Délai de prescription',icon: 'clock',    color: '#ea580c' },
  { value: 'remise_document',   label: 'Remise de document',  icon: 'file',      color: '#FF8A00' },
  { value: 'consultation',      label: 'Consultation',        icon: 'message',   color: '#059669' },
  { value: 'reunion',           label: 'Réunion',             icon: 'users',     color: '#FF5A00' },
  { value: 'expertise',         label: 'Expertise',           icon: 'search',    color: '#9333ea' },
  { value: 'autre',             label: 'Autre',               icon: 'pin',       color: '#64748b' },
];

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FR   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

type ViewMode = 'month' | 'list' | 'upcoming';

@Component({
  selector:    'app-agenda',
  imports:     [CommonModule, NgTemplateOutlet, FormsModule, RouterLink, UiIcon],
  templateUrl: './agenda.html',
  styleUrl:    './agenda.scss',
})
export class Agenda implements OnInit {
  private http = inject(HttpClient);
  private api  = environment.apiUrl;

  // ── Vue ───────────────────────────────────────────────────────────────────────
  viewMode    = signal<ViewMode>('month');
  currentDate = signal(new Date());
  today       = new Date();

  // ── Données ───────────────────────────────────────────────────────────────────
  events   = signal<AgendaEvent[]>([]);
  stats    = signal<AgendaStats | null>(null);
  cases    = signal<CaseOption[]>([]);
  loading  = signal(false);

  // ── Modal ajout/édition ───────────────────────────────────────────────────────
  showModal    = signal(false);
  editingId    = signal<string | null>(null);
  saving       = signal(false);
  form = {
    title: signal(''), description: signal(''), location: signal(''),
    event_type: signal('audience'), start_date: signal(''), start_time: signal('09:00'),
    end_date: signal(''), end_time: signal('10:00'), is_all_day: signal(false),
    reminder_days: signal(1), color: signal(''), case_id: signal(''),
  };

  // ── Modal sync ────────────────────────────────────────────────────────────────
  showSyncModal = signal(false);

  // ── Modal détail ──────────────────────────────────────────────────────────────
  detailEvent = signal<AgendaEvent | null>(null);

  // ── Config constantes ─────────────────────────────────────────────────────────
  readonly eventTypes   = EVENT_TYPES;
  readonly monthsFr     = MONTHS_FR;
  readonly daysFr       = DAYS_FR;
  readonly reminderOpts = [0, 1, 2, 3, 7, 14, 30];

  // ── Computed calendrier ───────────────────────────────────────────────────────
  readonly currentMonth = computed(() => this.currentDate().getMonth());
  readonly currentYear  = computed(() => this.currentDate().getFullYear());
  readonly monthLabel   = computed(() => `${MONTHS_FR[this.currentMonth()]} ${this.currentYear()}`);

  readonly calendarDays = computed<CalendarDay[]>(() => {
    const year  = this.currentYear();
    const month = this.currentMonth();
    const first = new Date(year, month, 1);
    const last  = new Date(year, month + 1, 0);
    // Lundi = 0
    let startDow = first.getDay() - 1; if (startDow < 0) startDow = 6;
    const days: CalendarDay[] = [];
    // Jours du mois précédent
    for (let i = startDow - 1; i >= 0; i--) {
      const d = new Date(year, month, -i);
      days.push({ date: d, isCurrentMonth: false, isToday: false, events: [] });
    }
    // Jours du mois courant
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(year, month, d);
      const isToday = this._sameDay(date, this.today);
      const evs = this.events().filter(e => {
        const ed = new Date(e.start_at);
        return this._sameDay(ed, date);
      });
      days.push({ date, isCurrentMonth: true, isToday, events: evs });
    }
    // Compléter jusqu'à 42 cases (6 semaines)
    while (days.length < 42) {
      const prev = days[days.length - 1].date;
      const d = new Date(prev); d.setDate(d.getDate() + 1);
      days.push({ date: d, isCurrentMonth: false, isToday: false, events: [] });
    }
    return days;
  });

  readonly upcomingEvents = computed(() =>
    this.events()
      .filter(e => e.status === 'upcoming' && new Date(e.start_at) >= this.today)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  );

  readonly overdueEvents = computed(() =>
    this.events().filter(e => e.status === 'upcoming' && new Date(e.start_at) < this.today)
  );

  readonly listEvents = computed(() =>
    [...this.events()].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  );

  // ── Init ──────────────────────────────────────────────────────────────────────
  ngOnInit() {
    this.loadEvents();
    this.loadStats();
    this.loadCases();
  }

  // ── Chargement ────────────────────────────────────────────────────────────────
  loadEvents() {
    this.loading.set(true);
    const y = this.currentYear(), m = this.currentMonth() + 1;
    let url = `${this.api}/agenda?year=${y}&month=${m}`;
    if (this.viewMode() === 'upcoming') url = `${this.api}/agenda?upcoming=true`;
    if (this.viewMode() === 'list')     url = `${this.api}/agenda`;
    this.http.get<AgendaEvent[]>(url).subscribe({
      next:  evs => { this.events.set(evs); this.loading.set(false); },
      error: ()  => this.loading.set(false),
    });
  }

  loadStats() {
    this.http.get<AgendaStats>(`${this.api}/agenda/stats`).subscribe({
      next: s => this.stats.set(s),
    });
  }

  loadCases() {
    this.http.get<CaseOption[]>(`${this.api}/cases`).subscribe({
      next: c => this.cases.set(c),
    });
  }

  // ── Navigation calendrier ─────────────────────────────────────────────────────
  prevMonth() {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() - 1);
    this.currentDate.set(d);
    if (this.viewMode() === 'month') this.loadEvents();
  }
  nextMonth() {
    const d = new Date(this.currentDate());
    d.setMonth(d.getMonth() + 1);
    this.currentDate.set(d);
    if (this.viewMode() === 'month') this.loadEvents();
  }
  goToToday() {
    this.currentDate.set(new Date());
    if (this.viewMode() === 'month') this.loadEvents();
  }

  // ── Changer vue ───────────────────────────────────────────────────────────────
  setView(v: ViewMode) { this.viewMode.set(v); this.loadEvents(); }

  // ── Ouvrir modal ─────────────────────────────────────────────────────────────
  openNew(date?: Date) {
    this.editingId.set(null);
    const d = date ?? new Date();
    this._resetForm();
    this.form.start_date.set(this._toDateStr(d));
    this.form.end_date.set(this._toDateStr(d));
    this.showModal.set(true);
  }

  openEdit(ev: AgendaEvent) {
    this.editingId.set(ev.id);
    this.detailEvent.set(null);
    const sd = new Date(ev.start_at), ed = ev.end_at ? new Date(ev.end_at) : sd;
    this.form.title.set(ev.title);
    this.form.description.set(ev.description);
    this.form.location.set(ev.location ?? '');
    this.form.event_type.set(ev.event_type);
    this.form.start_date.set(this._toDateStr(sd));
    this.form.start_time.set(this._toTimeStr(sd));
    this.form.end_date.set(this._toDateStr(ed));
    this.form.end_time.set(this._toTimeStr(ed));
    this.form.is_all_day.set(ev.is_all_day);
    this.form.reminder_days.set(ev.reminder_days);
    this.form.color.set(ev.color ?? '');
    this.form.case_id.set(ev.case_id ?? '');
    this.showModal.set(true);
  }

  openDetail(ev: AgendaEvent, e: MouseEvent) {
    e.stopPropagation();
    this.detailEvent.set(ev);
  }

  // ── Sauvegarder ──────────────────────────────────────────────────────────────
  saveEvent() {
    if (!this.form.title()) return;
    this.saving.set(true);

    const payload: any = {
      title:         this.form.title(),
      description:   this.form.description(),
      location:      this.form.location() || null,
      event_type:    this.form.event_type(),
      start_at:      this._buildIso(this.form.start_date(), this.form.start_time()),
      end_at:        this.form.end_date()
                       ? this._buildIso(this.form.end_date(), this.form.end_time()) : null,
      is_all_day:    this.form.is_all_day(),
      reminder_days: this.form.reminder_days(),
      color:         this.form.color() || null,
      case_id:       this.form.case_id() || null,
    };

    const id = this.editingId();
    const req = id
      ? this.http.put<AgendaEvent>(`${this.api}/agenda/${id}`, payload)
      : this.http.post<AgendaEvent>(`${this.api}/agenda`, payload);

    req.subscribe({
      next: ev => {
        this.saving.set(false);
        this.showModal.set(false);
        if (id) {
          this.events.update(list => list.map(e => e.id === id ? ev : e));
        } else {
          this.events.update(list => [...list, ev]);
        }
        this.loadStats();
      },
      error: () => this.saving.set(false),
    });
  }

  // ── Actions événement ─────────────────────────────────────────────────────────
  markDone(ev: AgendaEvent) {
    this.http.put<AgendaEvent>(`${this.api}/agenda/${ev.id}/status`, { status: 'done' }).subscribe({
      next: updated => {
        this.events.update(list => list.map(e => e.id === ev.id ? updated : e));
        if (this.detailEvent()?.id === ev.id) this.detailEvent.set(updated);
        this.loadStats();
      },
    });
  }

  cancelEvent(ev: AgendaEvent) {
    this.http.put<AgendaEvent>(`${this.api}/agenda/${ev.id}/status`, { status: 'cancelled' }).subscribe({
      next: updated => {
        this.events.update(list => list.map(e => e.id === ev.id ? updated : e));
        if (this.detailEvent()?.id === ev.id) this.detailEvent.set(updated);
        this.loadStats();
      },
    });
  }

  deleteEvent(ev: AgendaEvent) {
    if (!confirm('Supprimer cet événement ?')) return;
    this.http.delete(`${this.api}/agenda/${ev.id}`).subscribe({
      next: () => {
        this.events.update(list => list.filter(e => e.id !== ev.id));
        if (this.detailEvent()?.id === ev.id) this.detailEvent.set(null);
        this.loadStats();
      },
    });
  }

  // ── Sync / Export ─────────────────────────────────────────────────────────────
  downloadIcal() {
    const token = localStorage.getItem('access_token') ?? '';
    this.http.get(`${this.api}/agenda/export/ical`, {
      responseType: 'blob',
      headers: { Authorization: `Bearer ${token}` }
    }).subscribe(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'justicia-agenda.ics'; a.click();
      URL.revokeObjectURL(url);
    });
  }

  syncToGoogle() {
    this.showSyncModal.set(false);
    // Ouvrir Google Calendar avec le premier événement à venir, ou instructions d'import
    const ev = this.upcomingEvents()[0];
    if (ev) {
      this.openGoogleCalendar(ev);
    } else {
      // Pas d'événements : télécharger le .ics et guider l'utilisateur
      this.downloadIcal();
    }
  }

  openGoogleCalendar(ev: AgendaEvent) {
    const sd  = new Date(ev.start_at);
    const ed  = ev.end_at ? new Date(ev.end_at) : new Date(sd.getTime() + 3600000);
    const fmt = (d: Date) => d.toISOString().replace(/[-:]/g,'').split('.')[0]+'Z';
    const params = new URLSearchParams({
      action: 'TEMPLATE', text: ev.title,
      dates: `${fmt(sd)}/${fmt(ed)}`,
      details: ev.description ?? '',
      location: ev.location ?? '',
    });
    window.open(`https://calendar.google.com/calendar/render?${params}`, '_blank');
  }

  openOutlook(ev: AgendaEvent) {
    const sd = new Date(ev.start_at);
    const ed = ev.end_at ? new Date(ev.end_at) : new Date(sd.getTime() + 3600000);
    const params = new URLSearchParams({
      path: '/calendar/action/compose', rru: 'addevent',
      subject: ev.title, body: ev.description ?? '',
      location: ev.location ?? '',
      startdt: sd.toISOString(), enddt: ed.toISOString(),
    });
    window.open(`https://outlook.live.com/calendar/0/deeplink/compose?${params}`, '_blank');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────
  getTypeConfig(type: string) {
    return EVENT_TYPES.find(t => t.value === type) ?? EVENT_TYPES[EVENT_TYPES.length - 1];
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  formatRelative(iso: string): string {
    const d = new Date(iso);
    const diff = Math.ceil((d.getTime() - this.today.getTime()) / 86400000);
    if (diff === 0) return 'Aujourd\'hui';
    if (diff === 1) return 'Demain';
    if (diff === -1) return 'Hier';
    if (diff < 0)  return `Il y a ${Math.abs(diff)}j`;
    if (diff < 7)  return `Dans ${diff}j`;
    if (diff < 30) return `Dans ${Math.ceil(diff/7)} sem.`;
    return `Dans ${Math.ceil(diff/30)} mois`;
  }

  isOverdue(ev: AgendaEvent) { return ev.status === 'upcoming' && new Date(ev.start_at) < this.today; }
  isToday(iso: string)       { return this._sameDay(new Date(iso), this.today); }

  private _sameDay(a: Date, b: Date): boolean {
    return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
  }

  _isSameDateStr(a: string, b: string): boolean {
    return this._sameDay(new Date(a), new Date(b));
  }

  private _toDateStr(d: Date): string {
    const mm = String(d.getMonth()+1).padStart(2,'0');
    const dd = String(d.getDate()).padStart(2,'0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  private _toTimeStr(d: Date): string {
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
  }

  private _buildIso(date: string, time: string): string {
    return new Date(`${date}T${time}:00`).toISOString();
  }

  private _resetForm() {
    this.form.title.set(''); this.form.description.set('');
    this.form.location.set(''); this.form.event_type.set('audience');
    this.form.start_date.set(''); this.form.start_time.set('09:00');
    this.form.end_date.set(''); this.form.end_time.set('10:00');
    this.form.is_all_day.set(false); this.form.reminder_days.set(1);
    this.form.color.set(''); this.form.case_id.set('');
  }

  trackById(_: number, e: AgendaEvent) { return e.id; }
}

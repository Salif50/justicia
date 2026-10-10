import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

interface Stats {
  total_users: number;
  active_users: number;
  admin_users: number;
  total_conversations: number;
  total_messages: number;
  total_contacts: number;
  unread_contacts: number;
}

interface DayData { date: string; count: number; }

interface Metrics {
  users_per_day:         DayData[];
  conversations_per_day: DayData[];
  messages_per_day:      DayData[];
  contacts_per_day:      DayData[];
  auth_providers:        Record<string, number>;
  growth: {
    this_week_users: number;
    last_week_users: number;
    this_week_convs: number;
    last_week_convs: number;
  };
}

interface ChartPoint { x: number; y: number; date: string; count: number; }

@Component({
  selector: 'app-admin-dashboard',
  imports: [CommonModule, RouterLink],
  templateUrl: './admin-dashboard.html',
  styleUrl:    './admin-dashboard.scss',
})
export class AdminDashboard implements OnInit {
  activeTab      = signal<'overview' | 'metrics'>('overview');
  stats          = signal<Stats | null>(null);
  metrics        = signal<Metrics | null>(null);
  isLoading      = signal(true);
  metricsLoading = signal(false);
  error          = signal('');

  constructor(private http: HttpClient) {}

  ngOnInit() { this.loadStats(); }

  loadStats() {
    this.isLoading.set(true);
    this.http.get<Stats>(`${environment.apiUrl}/admin/stats`).subscribe({
      next: (s) => { this.stats.set(s); this.isLoading.set(false); },
      error: ()  => { this.error.set('Impossible de charger les statistiques.'); this.isLoading.set(false); },
    });
  }

  switchTab(tab: 'overview' | 'metrics') {
    this.activeTab.set(tab);
    if (tab === 'metrics' && !this.metrics()) this.loadMetrics();
  }

  loadMetrics() {
    this.metricsLoading.set(true);
    this.http.get<Metrics>(`${environment.apiUrl}/admin/metrics`).subscribe({
      next: (m) => { this.metrics.set(m); this.metricsLoading.set(false); },
      error: ()  => { this.metricsLoading.set(false); },
    });
  }

  refresh() {
    this.loadStats();
    if (this.activeTab() === 'metrics') {
      this.metrics.set(null);
      this.loadMetrics();
    }
  }

  // ── Chart helpers ─────────────────────────────────────────────────────────

  private coords(data: DayData[]): ChartPoint[] {
    if (!data.length) return [];
    const max = Math.max(...data.map(d => d.count), 1);
    const W = 500, H = 80, px = 12, py = 6;
    const uw = W - 2 * px, uh = H - 2 * py;
    return data.map((d, i) => ({
      x: px + (data.length > 1 ? (i / (data.length - 1)) * uw : uw / 2),
      y: py + uh - (d.count / max) * uh,
      date: d.date,
      count: d.count,
    }));
  }

  linePath(data: DayData[]): string {
    return this.coords(data)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
      .join(' ');
  }

  areaPath(data: DayData[]): string {
    const pts = this.coords(data);
    if (!pts.length) return '';
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const bY = 86;
    return `${line} L${pts[pts.length - 1].x.toFixed(1)},${bY} L${pts[0].x.toFixed(1)},${bY} Z`;
  }

  chartPoints(data: DayData[]): ChartPoint[] { return this.coords(data); }

  maxVal(data: DayData[]): number { return Math.max(...data.map(d => d.count), 0); }

  barHeight(count: number, data: DayData[]): number {
    const max = this.maxVal(data);
    return max > 0 ? (count / max) * 100 : 0;
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  trendLabel(current: number, previous: number): string {
    if (previous === 0) return current > 0 ? '+100%' : '—';
    const pct = Math.round(((current - previous) / previous) * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
  }

  trendUp(current: number, previous: number): boolean {
    return current >= previous;
  }

  totalProviders(providers: Record<string, number>): number {
    return Object.values(providers).reduce((a, b) => a + b, 0);
  }

  providerPct(count: number, providers: Record<string, number>): number {
    const total = this.totalProviders(providers);
    return total > 0 ? Math.round((count / total) * 100) : 0;
  }

  providerEntries(providers: Record<string, number>): Array<{key: string; count: number}> {
    return Object.entries(providers).map(([key, count]) => ({ key, count }));
  }

  // X-axis labels: show ~6 labels evenly spaced
  xLabels(data: DayData[]): Array<{ label: string; pos: number }> {
    if (data.length < 2) return [];
    const W = 500, px = 12, uw = W - 2 * px;
    const step = Math.max(1, Math.floor(data.length / 5));
    const result: Array<{ label: string; pos: number }> = [];
    for (let i = 0; i < data.length; i += step) {
      result.push({
        label: this.formatDate(data[i].date),
        pos: px + (i / (data.length - 1)) * uw,
      });
    }
    return result;
  }

  total(data: DayData[]): number {
    return data.reduce((acc, d) => acc + d.count, 0);
  }

  activationRate(active: number, total: number): number {
    return total > 0 ? Math.round((active / total) * 100) : 0;
  }

  msgsPerConv(msgs: number, convs: number): string {
    return convs > 0 ? (msgs / convs).toFixed(1) : '0';
  }

  msgsPerConvBar(msgs: number, convs: number): number {
    const avg = convs > 0 ? msgs / convs : 0;
    return Math.min((avg / 20) * 100, 100);
  }

  readRate(total: number, unread: number): number {
    return total > 0 ? Math.round(((total - unread) / total) * 100) : 100;
  }
}

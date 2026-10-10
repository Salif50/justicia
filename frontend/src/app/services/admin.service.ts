import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

const API = environment.apiUrl;

export interface AdminConversation {
  id: string; title: string; agent_id: string;
  user_id: string; user_name: string; user_email: string;
  msg_count: number; created_at: string; updated_at: string;
}

export interface AdminMessage {
  id: string; sender: 'user' | 'bot'; content: string; created_at: string;
}

export interface AdminConversationDetail {
  id: string; title: string; agent_id: string;
  user_name: string; user_email: string; created_at: string;
  messages: AdminMessage[];
}

export interface AdminSubscription {
  id: string; user_id: string; user_name: string; user_email: string;
  plan_id: string; status: string; payment_method: string | null;
  renewal_date: string | null; created_at: string;
}

export interface ModerationRule {
  id: number; type: string; pattern: string; description: string;
  is_active: boolean; created_at: string; created_by: string;
}

export interface SystemConfig {
  maintenance:   { enabled: boolean; message: string };
  announcement:  { enabled: boolean; message: string; type: string };
  global_limits: { max_questions_free: number; max_questions_basic: number; max_questions_pro: number; max_questions_enterprise: number };
}

export interface TopUser {
  user_id: string; name: string; email: string; questions: number;
}

export interface RecentLogin {
  id: string; name: string; email: string; last_login: string; is_active: boolean; role: string;
}

export interface QuotaAlert {
  user_id: string; name: string; email: string; questions_used: number; reset_date: string | null;
}

export interface ConvCount { total_conversations: number; messages_today: number; }


// ── Gestion des utilisateurs (fiche, modération, quotas) ───────────────────
export interface AdminUserSummary {
  id: string; email: string; name: string; role: 'user' | 'admin';
  auth_provider: string; is_active: boolean; is_verified: boolean;
  profile_type: string | null; organization: string | null; city: string | null;
  created_at: string; last_login: string | null;
  blocked_reason: string | null; blocked_at: string | null; blocked_until: string | null;
  plan_id: string | null; plan_name: string; is_free_tier: boolean;
  daily_limit: number; plan_limit: number; is_override: boolean; questions_today: number;
  questions_count: number; conversations_count: number; ephemeral_mode: boolean;
}

export interface AdminUserPage {
  items: AdminUserSummary[]; total: number;
  counts: { all: number; blocked: number; admins: number };
}

export interface AdminAuditEntry {
  id: number; action: string; details: Record<string, any> | null;
  admin_email: string; target_user_id: string | null; target_email: string | null; created_at: string;
}

export interface AdminUserDetail extends AdminUserSummary {
  phone: string | null; profession: string | null; bar_number: string | null;
  address: string | null; bio: string | null; language: string;
  profile_completed: boolean; onboarding_survey: Record<string, any> | null;
  admin_notes: string | null; updated_at: string | null;
  preferences: { ephemeral_mode: boolean; save_conversations: boolean; newsletter: boolean; share_analytics: boolean } | null;
  usage: { cases: number; custom_agents: number; archives: number; generated_documents: number; agenda_events: number };
  subscriptions: { id: string; plan_id: string; status: string; payment_method: string | null; created_at: string; renewal_date: string | null }[];
  recent_questions: { id: string; question: string; created_at: string; conversation_id: string; conversation_title: string; agent_id: string }[];
  activity: { date: string; count: number }[];
  audit: AdminAuditEntry[];
  available_plans: { plan_id: string; name: string; daily_limit?: number }[];
}

export interface AdminQuestion {
  id: string; question: string; created_at: string;
  conversation_id: string; conversation_title: string; agent_id: string;
  user_id: string; user_name: string; user_email: string; user_active: boolean;
  answer: string | null; sources_count: number;
}

export interface AdminQuestionPage {
  items: AdminQuestion[]; total: number;
  stats: { today: number; week: number; users_today: number };
}

export interface UserListQuery {
  q?: string; status?: 'all' | 'active' | 'blocked'; plan?: string; role?: string;
  sort?: 'recent' | 'last_login' | 'questions'; skip?: number; limit?: number;
}

export interface QuestionQuery {
  q?: string; user_id?: string; agent_id?: string; period?: 'all' | 'today' | '7d' | '30d';
  skip?: number; limit?: number;
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);

  // ── Conversations ─────────────────────────────────────────────────────────
  getConversations(params: { skip?: number; limit?: number; user_id?: string; agent_id?: string; q?: string } = {}): Observable<AdminConversation[]> {
    let p = new HttpParams();
    if (params.skip    != null) p = p.set('skip',     params.skip);
    if (params.limit   != null) p = p.set('limit',    params.limit);
    if (params.user_id)         p = p.set('user_id',  params.user_id);
    if (params.agent_id)        p = p.set('agent_id', params.agent_id);
    if (params.q)               p = p.set('q',        params.q);
    return this.http.get<AdminConversation[]>(`${API}/admin/conversations`, { params: p });
  }

  getConversationCount(): Observable<ConvCount> {
    return this.http.get<ConvCount>(`${API}/admin/conversations/count`);
  }

  getConversationMessages(id: string): Observable<AdminConversationDetail> {
    return this.http.get<AdminConversationDetail>(`${API}/admin/conversations/${id}/messages`);
  }

  deleteConversation(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API}/admin/conversations/${id}`);
  }


  // ── Subscriptions ─────────────────────────────────────────────────────────
  getSubscriptions(params: { status_filter?: string; plan_filter?: string } = {}): Observable<AdminSubscription[]> {
    let p = new HttpParams();
    if (params.status_filter) p = p.set('status_filter', params.status_filter);
    if (params.plan_filter)   p = p.set('plan_filter',   params.plan_filter);
    return this.http.get<AdminSubscription[]>(`${API}/admin/subscriptions`, { params: p });
  }

  // ── Moderation ────────────────────────────────────────────────────────────
  getModerationRules(): Observable<ModerationRule[]> {
    return this.http.get<ModerationRule[]>(`${API}/admin/moderation`);
  }

  createModerationRule(rule: { type: string; pattern: string; description: string }): Observable<ModerationRule> {
    const p = new HttpParams()
      .set('type', rule.type)
      .set('pattern', rule.pattern)
      .set('description', rule.description);
    return this.http.post<ModerationRule>(`${API}/admin/moderation`, null, { params: p });
  }

  toggleModerationRule(id: number): Observable<{ id: number; is_active: boolean }> {
    return this.http.patch<{ id: number; is_active: boolean }>(`${API}/admin/moderation/${id}/toggle`, {});
  }

  deleteModerationRule(id: number): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API}/admin/moderation/${id}`);
  }

  // ── System ────────────────────────────────────────────────────────────────
  getSystemConfig(): Observable<SystemConfig> {
    return this.http.get<SystemConfig>(`${API}/admin/system`);
  }

  setMaintenance(enabled: boolean, message: string): Observable<{ success: boolean; enabled: boolean }> {
    return this.http.put<{ success: boolean; enabled: boolean }>(`${API}/admin/system/maintenance`, null, {
      params: { enabled: String(enabled), message }
    });
  }

  setAnnouncement(data: { enabled: boolean; message: string; type: string }): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${API}/admin/system/announcement`, null, {
      params: { enabled: String(data.enabled), message: data.message, type: data.type }
    });
  }

  setGlobalLimits(limits: { max_free: number; max_basic: number; max_pro: number; max_enterprise: number }): Observable<{ success: boolean }> {
    return this.http.put<{ success: boolean }>(`${API}/admin/system/global-limits`, null, {
      params: {
        max_free:       String(limits.max_free),
        max_basic:      String(limits.max_basic),
        max_pro:        String(limits.max_pro),
        max_enterprise: String(limits.max_enterprise),
      }
    });
  }

  // ── Activity ──────────────────────────────────────────────────────────────
  getTopUsers(days = 7): Observable<TopUser[]> {
    return this.http.get<TopUser[]>(`${API}/admin/activity/top-users`, { params: { days } });
  }

  getRecentLogins(): Observable<RecentLogin[]> {
    return this.http.get<RecentLogin[]>(`${API}/admin/activity/recent-logins`);
  }

  getQuotaAlerts(): Observable<QuotaAlert[]> {
    return this.http.get<QuotaAlert[]>(`${API}/admin/activity/quota-alerts`);
  }

  // ── Export ────────────────────────────────────────────────────────────────
  exportUsers(): string {
    return `${API}/admin/export/users`;
  }

  exportConversations(): string {
    return `${API}/admin/export/conversations`;
  }

  // ── Utilisateurs : liste, fiche, modération ─────────────────────────────
  listUsers(query: UserListQuery = {}): Observable<AdminUserPage> {
    return this.http.get<AdminUserPage>(`${API}/admin/users`, { params: clean(query) });
  }

  getUserDetail(id: string): Observable<AdminUserDetail> {
    return this.http.get<AdminUserDetail>(`${API}/admin/users/${id}/detail`);
  }

  /** `notify` : prévenir l'utilisateur (notification dans l'app + e-mail). */
  setUserQuota(id: string, dailyLimit: number | null, notify = true): Observable<AdminUserSummary> {
    return this.http.put<AdminUserSummary>(`${API}/admin/users/${id}/quota`, { daily_limit: dailyLimit, notify });
  }

  resetUserQuota(id: string, notify = true): Observable<AdminUserSummary> {
    return this.http.post<AdminUserSummary>(`${API}/admin/users/${id}/reset-quota`, {}, { params: { notify } });
  }

  setUserPlan(id: string, planId: string, months = 12, notify = true): Observable<AdminUserSummary> {
    return this.http.put<AdminUserSummary>(`${API}/admin/users/${id}/plan`, { plan_id: planId, months, notify });
  }

  /** `durationDays` : null = suspension sans échéance. */
  setUserBlocked(id: string, blocked: boolean, opts: { reason?: string; durationDays?: number | null; notify?: boolean } = {}): Observable<AdminUserSummary> {
    return this.http.put<AdminUserSummary>(`${API}/admin/users/${id}/block`, {
      blocked, reason: opts.reason ?? null, duration_days: opts.durationDays ?? null, notify: opts.notify ?? true,
    });
  }

  setUserRole(id: string, role: 'user' | 'admin'): Observable<AdminUserSummary> {
    return this.http.put<AdminUserSummary>(`${API}/admin/users/${id}/role`, { role });
  }

  setUserNotes(id: string, notes: string): Observable<{ admin_notes: string | null }> {
    return this.http.put<{ admin_notes: string | null }>(`${API}/admin/users/${id}/notes`, { notes });
  }

  deleteUserConversations(id: string): Observable<{ success: boolean; deleted: number }> {
    return this.http.delete<{ success: boolean; deleted: number }>(`${API}/admin/users/${id}/conversations`);
  }

  deleteUser(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${API}/admin/users/${id}`);
  }

  // ── Questions posées & journal ──────────────────────────────────────────
  listQuestions(query: QuestionQuery = {}): Observable<AdminQuestionPage> {
    return this.http.get<AdminQuestionPage>(`${API}/admin/questions`, { params: clean(query) });
  }

  listAudit(skip = 0, limit = 50): Observable<AdminAuditEntry[]> {
    return this.http.get<AdminAuditEntry[]>(`${API}/admin/audit`, { params: { skip, limit } });
  }

}

/** Retire les paramètres vides avant de les envoyer en query string. */
function clean(query: object): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string | number>;
}

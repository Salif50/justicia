import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { isAuthError } from '../core/utils/auth-error.util';

export interface AppNotification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'case' | 'conversation' | 'system';
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  unread_count: number;
  notifications: AppNotification[];
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private api = environment.apiUrl;

  isOpen        = signal(false);
  notifications = signal<AppNotification[]>([]);
  unreadCount   = computed(() => this.notifications().filter(n => !n.is_read).length);

  constructor(private http: HttpClient) {}

  load(): Observable<NotificationsResponse> {
    return this.http.get<NotificationsResponse>(`${this.api}/notifications`).pipe(
      tap(r => this.notifications.set(r.notifications)),
      catchError((err) => {
        if (isAuthError(err)) return throwError(() => err);
        return of({ unread_count: 0, notifications: [] });
      })
    );
  }

  markRead(id: string): void {
    this.http.put(`${this.api}/notifications/${id}/read`, {}).pipe(
      catchError(() => of(null))
    ).subscribe();
    this.notifications.update(list =>
      list.map(n => n.id === id ? { ...n, is_read: true } : n)
    );
  }

  markAllRead(): void {
    this.http.put(`${this.api}/notifications/read-all`, {}).pipe(
      catchError(() => of(null))
    ).subscribe();
    this.notifications.update(list => list.map(n => ({ ...n, is_read: true })));
  }

  delete(id: string): void {
    this.http.delete(`${this.api}/notifications/${id}`).pipe(
      catchError(() => of(null))
    ).subscribe();
    this.notifications.update(list => list.filter(n => n.id !== id));
  }

  clearRead(): void {
    this.http.delete(`${this.api}/notifications`).pipe(
      catchError(() => of(null))
    ).subscribe();
    this.notifications.update(list => list.filter(n => !n.is_read));
  }

  open()   { this.isOpen.set(true); }
  close()  { this.isOpen.set(false); }
  toggle() { this.isOpen.update(v => !v); }
}

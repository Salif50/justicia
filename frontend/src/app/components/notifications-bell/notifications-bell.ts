import { Component, HostListener, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NotificationService, AppNotification } from '../../services/notification.service';

const TYPE_META: Record<string, { icon: string; color: string }> = {
  info:         { icon: 'ℹ️',  color: '#3b82f6' },
  success:      { icon: '✅',  color: '#22c55e' },
  warning:      { icon: '⚠️', color: '#f59e0b' },
  case:         { icon: '⚖️', color: '#8b5cf6' },
  conversation: { icon: '💬', color: '#0ea5e9' },
  system:       { icon: '🔔', color: '#64748b' },
};

@Component({
  selector:    'app-notifications-bell',
  imports:     [CommonModule, RouterLink],
  templateUrl: './notifications-bell.html',
  styleUrl:    './notifications-bell.scss',
})
export class NotificationsBell implements OnInit {
  svc = inject(NotificationService);

  ngOnInit(): void { this.svc.load().subscribe(); }

  get isOpen()   { return this.svc.isOpen(); }
  get count()    { return this.svc.unreadCount(); }
  get list()     { return this.svc.notifications(); }

  toggle() { this.svc.toggle(); }

  markRead(n: AppNotification) {
    if (!n.is_read) this.svc.markRead(n.id);
  }

  markAll()     { this.svc.markAllRead(); }
  remove(id: string) { this.svc.delete(id); }
  clearRead()   { this.svc.clearRead(); }

  typeMeta(type: string) { return TYPE_META[type] ?? TYPE_META['info']; }

  formatDate(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)  return 'À l\'instant';
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `Il y a ${diffH}h`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7)  return `Il y a ${diffD}j`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }

  // Fermer si on clique dehors
  @HostListener('document:click', ['$event'])
  onOutsideClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (this.isOpen && !target.closest('app-notifications-bell')) {
      this.svc.close();
    }
  }
}

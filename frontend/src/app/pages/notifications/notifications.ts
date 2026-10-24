import { Component, computed, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AppNotification, NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-notifications-page',
  imports: [CommonModule],
  templateUrl: './notifications.html',
  styleUrl: './notifications.scss',
})
export class NotificationsPage implements OnInit {
  filter = signal<'all' | 'unread'>('all');
  loading = signal(true);
  error = signal('');
  hasRead = computed(() => this.notifications.notifications().some(n => n.is_read));
  visible = computed(() => {
    const list = this.notifications.notifications();
    return this.filter() === 'unread' ? list.filter(n => !n.is_read) : list;
  });

  constructor(public notifications: NotificationService, private router: Router) {}

  ngOnInit() {
    this.notifications.load().subscribe({
      next: () => this.loading.set(false),
      error: () => { this.error.set('Impossible de charger les notifications.'); this.loading.set(false); },
    });
  }

  open(item: AppNotification) {
    if (!item.is_read) this.notifications.markRead(item.id);
    if (item.link) this.router.navigateByUrl(item.link);
  }

  icon(type: AppNotification['type']) {
    return ({ success: '✓', warning: '!', case: '⚖', conversation: '◌', system: '⚙', info: 'i' } as Record<string, string>)[type] || 'i';
  }

  date(value: string) {
    return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
  }
}

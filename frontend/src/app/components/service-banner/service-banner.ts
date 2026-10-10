import { Component, inject } from '@angular/core';
import { BackendStatusService } from '../../services/backend-status.service';

/** Bandeau global affiché tant que le backend est injoignable. */
@Component({
  selector: 'app-service-banner',
  standalone: true,
  templateUrl: './service-banner.html',
  styleUrl: './service-banner.scss',
})
export class ServiceBanner {
  protected readonly status = inject(BackendStatusService);

  retry(): void {
    this.status.check();
  }
}

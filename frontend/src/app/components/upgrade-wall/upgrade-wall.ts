import { Component, Input, Output, EventEmitter, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FeatureService } from '../../services/feature.service';

@Component({
  selector:    'app-upgrade-wall',
  imports:     [CommonModule],
  templateUrl: './upgrade-wall.html',
  styleUrl:    './upgrade-wall.scss',
})
export class UpgradeWall {
  /** Clé de la fonctionnalité bloquée */
  @Input() featureKey = '';
  /** Message personnalisé (optionnel) */
  @Input() message = '';
  /** Mode : 'block' = remplace le contenu | 'modal' = overlay */
  @Input() mode: 'block' | 'modal' = 'block';
  /** Émettre quand l'utilisateur ferme le modal */
  @Output() close = new EventEmitter<void>();

  constructor(
    private features: FeatureService,
    private router:   Router,
  ) {}

  get featureLabel(): string {
    return this.features.label(this.featureKey);
  }

  get requiredPlan(): string {
    return this.features.requiredPlan(this.featureKey);
  }

  get currentPlan(): string {
    return this.features.planName();
  }

  goToPlans(): void {
    this.router.navigate(['/dashboard/subscription']);
    this.close.emit();
  }

  dismiss(): void {
    this.close.emit();
  }
}

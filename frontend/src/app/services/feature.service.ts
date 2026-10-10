import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap, of, catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { isAuthError } from '../core/utils/auth-error.util';
import { isBackendUnavailable } from './backend-status.service';

export interface UserFeatures {
  plan_id: string;
  plan_name: string;
  features: string[];
  is_free: boolean;
}

// Catalogue complet des fonctionnalités avec labels lisibles
export const FEATURE_LABELS: Record<string, string> = {
  chat_basic:             '5 questions par jour',
  chat_unlimited:         'Questions IA illimitées',
  ai_citations:           'Citations de sources dans les réponses',
  ai_summary:             'Résumé automatique de document',
  ai_document_generation: 'Génération de documents juridiques',
  ai_contract_analysis:   'Analyse de contrat (risques, clauses)',
  ai_case_prediction:     "Prédiction d'issue",
  proces_create:          'Créer des procès',
  proces_limit_1:         '1 procès actif',
  proces_limit_5:         "Jusqu'à 5 procès actifs",
  proces_unlimited:       'Procès illimités',
  proces_docs_unlimited:  'Documents illimités par procès',
  proces_export_pdf:      'Export PDF du dossier',
  proces_timeline:        'Chronologie automatique',
  proces_deadlines:       "Rappels d'échéances",
  agents_builtin:         'Agents IA intégrés',
  agents_custom:          'Agents personnalisés',
  agents_cabinet:         'Agents partagés (cabinet)',
  history_limited:        'Historique 30 jours',
  history_unlimited:      'Historique illimité',
  search_global:          'Recherche globale',
  multi_user:             'Multi-utilisateurs (cabinet)',
  roles_permissions:      'Rôles et permissions',
  collaborative_notes:    'Annotations collaboratives',
  client_management:      'Gestion des clients',
  time_tracking:          'Suivi du temps / facturation',
  shared_agenda:          'Agenda partagé',
  case_registry:          'Registre numérique des affaires',
  audit_trail:            "Journal d'audit",
  public_calendar:        "Calendrier d'audience public",
  ministerial_dashboard:  'Tableau de bord ministériel',
  priority_support:       'Support prioritaire',
  analytics_advanced:     'Analytics avancés',
  api_access:             'Accès API',
  custom_branding:        'Personnalisation marque',
  sla_guarantee:          'Garantie SLA 99.9%',
};

// Plan requis par fonctionnalité (pour afficher l'upgrade wall)
export const FEATURE_REQUIRED_PLAN: Record<string, string> = {
  ai_summary:             'Basic',
  ai_citations:           'Basic',
  agents_custom:          'Basic',
  proces_limit_5:         'Basic',
  history_unlimited:      'Basic',
  search_global:          'Basic',
  ai_document_generation: 'Pro',
  ai_contract_analysis:   'Pro',
  ai_case_prediction:     'Pro',
  proces_unlimited:       'Pro',
  proces_export_pdf:      'Pro',
  proces_timeline:        'Pro',
  proces_deadlines:       'Pro',
  analytics_advanced:     'Pro',
  multi_user:             'Entreprise',
  roles_permissions:      'Entreprise',
  client_management:      'Entreprise',
  time_tracking:          'Entreprise',
  agents_cabinet:         'Entreprise',
  api_access:             'Entreprise',
};

@Injectable({ providedIn: 'root' })
export class FeatureService {
  private _features = signal<UserFeatures | null>(null);
  private _loaded   = signal(false);

  readonly features    = this._features.asReadonly();
  readonly isLoaded    = this._loaded.asReadonly();
  readonly planId      = computed(() => this._features()?.plan_id ?? 'gratuit');
  readonly planName    = computed(() => this._features()?.plan_name ?? 'Gratuit');
  readonly isFree      = computed(() => this._features()?.is_free ?? true);
  readonly featureList = computed(() => this._features()?.features ?? []);

  constructor(private http: HttpClient) {}

  /** Charger les fonctionnalités depuis le backend */
  load(): Observable<UserFeatures> {
    return this.http.get<UserFeatures>(`${environment.apiUrl}/user/features`).pipe(
      tap(f => {
        this._features.set(f);
        this._loaded.set(true);
      }),
      catchError((err) => {
        if (isAuthError(err)) return throwError(() => err);
        const fallback = { plan_id: 'gratuit', plan_name: 'Gratuit', features: [], is_free: true };
        // Panne passagère : ne pas mémoriser un plan gratuit erroné, on rechargera
        if (isBackendUnavailable(err) || err?.error?.code === 'SERVICE_UNAVAILABLE') return of(fallback);
        this._features.set(fallback);
        this._loaded.set(true);
        return of(fallback);
      }),
    );
  }

  /** Vide le cache (à appeler lors de la déconnexion ou du changement de plan) */
  clear(): void {
    this._features.set(null);
    this._loaded.set(false);
  }

  /** L'utilisateur a-t-il accès à cette fonctionnalité ? */
  has(featureKey: string): boolean {
    return this._features()?.features.includes(featureKey) ?? false;
  }

  /** Plan requis pour accéder à une fonctionnalité */
  requiredPlan(featureKey: string): string {
    return FEATURE_REQUIRED_PLAN[featureKey] ?? 'Basic';
  }

  /** Label lisible d'une fonctionnalité */
  label(featureKey: string): string {
    return FEATURE_LABELS[featureKey] ?? featureKey;
  }
}

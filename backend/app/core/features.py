"""
Registre centralisé des fonctionnalités — JusticIA.

Chaque clé correspond à une fonctionnalité de l'application.
Les plans de tarification stockent une liste de ces clés dans `feature_flags`.
Le frontend interroge `GET /api/user/features` pour connaître
les fonctionnalités accessibles à l'utilisateur connecté.
"""

# ── Catalogue des fonctionnalités ────────────────────────────────────────────
FEATURE_REGISTRY: dict[str, str] = {
    # Questions IA
    "chat_basic":             "Chat IA (5 questions / jour)",
    "chat_unlimited":         "Questions IA illimitées",
    "ai_citations":           "Citations de sources dans les réponses IA",
    "ai_summary":             "Résumé automatique de document (1 clic)",
    "ai_document_generation": "Génération de documents juridiques (requêtes, mémoires…)",
    "ai_contract_analysis":   "Analyse de contrat (risques, clauses abusives)",
    "ai_case_prediction":     "Prédiction d'issue (probabilité de succès)",

    # Procès
    "proces_create":          "Créer des procès",
    "proces_limit_1":         "1 procès actif",
    "proces_limit_5":         "Jusqu'à 5 procès actifs",
    "proces_unlimited":       "Procès illimités",
    "proces_docs_unlimited":  "Documents illimités par procès",
    "proces_export_pdf":      "Export PDF complet d'un dossier",
    "proces_timeline":        "Chronologie automatique des faits",
    "proces_deadlines":       "Rappels / alertes échéances",

    # Agents
    "agents_builtin":         "Agents IA intégrés",
    "agents_custom":          "Création d'agents personnalisés",
    "agents_cabinet":         "Agents partagés au niveau du cabinet",

    # Historique & données
    "history_limited":        "Historique des conversations (30 jours)",
    "history_unlimited":      "Historique illimité",
    "search_global":          "Recherche globale dans tous les dossiers",

    # Cabinet / multi-utilisateurs
    "multi_user":             "Espace multi-utilisateurs (cabinet)",
    "roles_permissions":      "Gestion des rôles et permissions",
    "collaborative_notes":    "Annotations collaboratives",
    "client_management":      "Gestion des clients (CRM juridique)",
    "time_tracking":          "Suivi du temps et facturation",
    "shared_agenda":          "Agenda partagé du cabinet",

    # Gouvernement / institution
    "case_registry":          "Registre numérique des affaires",
    "audit_trail":            "Journal d'audit immuable",
    "public_calendar":        "Calendrier d'audience public",
    "ministerial_dashboard":  "Tableau de bord ministériel",

    # Support & avantages
    "priority_support":       "Support prioritaire",
    "analytics_advanced":     "Analytics avancés",
    "api_access":             "Accès API officielle",
    "custom_branding":        "Personnalisation (logo, couleurs)",
    "sla_guarantee":          "Garantie SLA 99.9%",
}

# ── Fonctionnalités par plan par défaut ──────────────────────────────────────
# Utilisé lors du seeding initial
PLAN_DEFAULT_FEATURES: dict[str, list[str]] = {
    "gratuit": [
        "chat_basic",
        "agents_builtin",
        "proces_create",
        "proces_limit_1",
        "history_limited",
    ],
    "basic": [
        "chat_unlimited",
        "ai_citations",
        "ai_summary",
        "agents_builtin",
        "agents_custom",
        "proces_create",
        "proces_limit_5",
        "proces_docs_unlimited",
        "history_unlimited",
        "search_global",
        "priority_support",
    ],
    "pro": [
        "chat_unlimited",
        "ai_citations",
        "ai_summary",
        "ai_document_generation",
        "ai_contract_analysis",
        "agents_builtin",
        "agents_custom",
        "proces_create",
        "proces_unlimited",
        "proces_docs_unlimited",
        "proces_export_pdf",
        "proces_timeline",
        "proces_deadlines",
        "history_unlimited",
        "search_global",
        "analytics_advanced",
        "priority_support",
    ],
    "enterprise": [
        "chat_unlimited",
        "ai_citations",
        "ai_summary",
        "ai_document_generation",
        "ai_contract_analysis",
        "ai_case_prediction",
        "agents_builtin",
        "agents_custom",
        "agents_cabinet",
        "proces_create",
        "proces_unlimited",
        "proces_docs_unlimited",
        "proces_export_pdf",
        "proces_timeline",
        "proces_deadlines",
        "history_unlimited",
        "search_global",
        "multi_user",
        "roles_permissions",
        "collaborative_notes",
        "client_management",
        "time_tracking",
        "shared_agenda",
        "analytics_advanced",
        "priority_support",
        "api_access",
        "custom_branding",
        "sla_guarantee",
    ],
}


def get_plan_features(plan_id: str | None) -> list[str]:
    """Retourne la liste des feature keys pour un plan donné."""
    return PLAN_DEFAULT_FEATURES.get(plan_id or "gratuit", PLAN_DEFAULT_FEATURES["gratuit"])

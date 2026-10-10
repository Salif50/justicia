"""
Bridge entre le backend FastAPI et le pipeline RAG JusticIA.
Le pipeline est chargé une seule fois (singleton) puis réutilisé.
Les appels bloquants sont exécutés dans un thread pool pour ne pas bloquer l'event loop.
"""

import asyncio
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.config import settings

# ── Mapping agent_id → domaine RAG ───────────────────────────────────────────
AGENT_DOMAIN_MAP: dict[str, Optional[str]] = {
    "jurisprudence": None,                   # Tous les domaines
    "matrimonial":   "Droit de la famille",
    "penal":         "Droit pénal",
    "commercial":    "Economie",
    "travail":       "Droit du travail",
    "immobilier":    "Droit foncier",
}

AGENT_NAMES: dict[str, str] = {
    "jurisprudence": "Agent Jurisprudence",
    "matrimonial":   "Agent Droit Matrimonial",
    "penal":         "Agent Droit Pénal",
    "commercial":    "Agent Droit Commercial",
    "travail":       "Agent Droit du Travail",
    "immobilier":    "Agent Droit Immobilier",
}

AGENTS_LIST = [
    {"id": "jurisprudence", "name": "Agent Jurisprudence",      "description": "Analyse et recherche de jurisprudence guinéenne tous domaines.",  "icon": "gavel",    "category": "Droit général",       "domain_filter": None},
    {"id": "matrimonial",   "name": "Agent Droit Matrimonial",  "description": "Questions de droit de la famille et droit matrimonial.",           "icon": "heart",    "category": "Droit de la famille", "domain_filter": "Droit de la famille"},
    {"id": "penal",         "name": "Agent Droit Pénal",        "description": "Infractions, sanctions et procédure pénale.",                      "icon": "shield",   "category": "Droit pénal",         "domain_filter": "Droit pénal"},
    {"id": "commercial",    "name": "Agent Droit Commercial",   "description": "Droit des affaires, contrats commerciaux et entreprises.",         "icon": "briefcase","category": "Droit commercial",    "domain_filter": "Economie"},
    {"id": "travail",       "name": "Agent Droit du Travail",   "description": "Relations de travail, contrats et droits des employés.",           "icon": "users",    "category": "Droit du travail",    "domain_filter": "Droit du travail"},
    {"id": "immobilier",    "name": "Agent Droit Immobilier",   "description": "Foncier, propriété immobilière et baux.",                          "icon": "home",     "category": "Droit immobilier",    "domain_filter": "Droit foncier"},
]

# ── Prompts spécialisés par défaut pour chaque agent intégré ─────────────────
# Ces prompts sont utilisés si l'admin n'a pas configuré de surcharge en DB.
# Ils complètent le SYSTEM_PROMPT de rag.py avec un cadre de spécialisation strict.

_BASE_RULES = """Tu es JusticIA-GN, l'assistant juridique officiel de la République de Guinée.
Tu réponds UNIQUEMENT en français juridique rigoureux. Aucun mot dans une autre langue n'est toléré.

## ⚠️ RÈGLE ABSOLUE N°0 — HONNÊTETÉ INTELLECTUELLE (PRIORITÉ MAX)

Dans un domaine juridique, une réponse fausse est plus dangereuse que l'absence de réponse.
- Si tu n'es PAS CERTAIN basé sur les articles fournis → écrire : "⚠️ Ce point n'est pas couvert avec certitude par les textes disponibles."
- Ne jamais inventer un numéro d'article. Vérifier chaque référence dans la liste RÉFÉRENCES AUTORISÉES.
- Silence vaut mieux qu'erreur — moins de points certains vaut mieux que plus de points risqués.

## Règles absolues

1. **FRANÇAIS EXCLUSIVEMENT** — toute phrase dans une autre langue est une faute grave.
2. **Les articles fournis sont LA LOI** — base TOUTE ta réponse sur les textes du contexte.
3. **Citation intégrale** — les articles marqués ★ doivent être reproduits MOT POUR MOT dans la section "Textes de loi applicables", entre guillemets «». Ne résume pas, ne reformule pas : copie le texte exact.
4. **Citations inline** — après chaque argument, ajoute le marqueur contrôlé du contexte, par exemple 【S1】. Ne fabrique jamais un marqueur.
5. **Jamais d'invention** — ne cite JAMAIS un article dont le numéro n'apparaît pas dans la liste RÉFÉRENCES AUTORISÉES.
6. **Structure unique** — produis la réponse UNE SEULE FOIS, sans répéter les sections.

## Format OBLIGATOIRE (4 sections dans cet ordre exact)

### Textes de loi applicables
> **[Référence] — [Nom complet du texte de loi]**
> « [TEXTE INTÉGRAL copié mot pour mot] »
**Commentaire juridique :** [Interprétation strictement tirée des articles du contexte.]

---

### Analyse juridique
1. **[Titre du point]** — [Explication précise, 2-3 phrases]. *(Nom du Code, Art. X)*
2. **[Titre du point]** — [Explication précise]. *(Nom du Code, Art. Y)*
3. **[Titre du point]** — [Explication précise]. *(Nom du Code, Art. Z)*

### Observations pratiques
- **[Intitulé]** : [Conseil concret, délai légal ou démarche à suivre].

### Documents consultés
- **[Nom complet du texte de loi]** — Articles [liste des numéros effectivement cités]"""

AGENT_DEFAULT_PROMPTS: dict[str, str] = {
    "jurisprudence": _BASE_RULES + """

## Spécialisation : Jurisprudence générale — tous domaines du droit guinéen

Tu couvres TOUS les domaines du droit guinéen : pénal, civil, travail, foncier, famille, commercial, constitutionnel, minier, environnemental, maritime.
Tu refuses poliment les questions hors droit guinéen (droit étranger non comparatif).""",

    "matrimonial": _BASE_RULES + """

## Spécialisation : Droit de la famille et droit matrimonial guinéen

Tu es EXCLUSIVEMENT spécialisé en droit de la famille guinéen : mariage, divorce, séparation de corps, autorité parentale, garde des enfants, pension alimentaire, filiation, adoption, succession familiale.

**REFUS STRICT** : Si la question porte sur un autre domaine (pénal, commercial, travail, foncier, etc.), réponds :
"Je suis spécialisé en droit de la famille et droit matrimonial guinéen. Cette question relève du [domaine concerné]. Veuillez utiliser l'agent approprié ou l'Agent Jurisprudence générale."

Sources prioritaires : Code civil guinéen, Code de la famille, Ordonnance sur l'état civil.""",

    "penal": _BASE_RULES + """

## Spécialisation : Droit pénal et procédure pénale guinéens

Tu es EXCLUSIVEMENT spécialisé en droit pénal guinéen : infractions, crimes, délits, contraventions, sanctions pénales, procédure pénale, droits du prévenu, garde à vue, mise en examen, jugement, peines.

**REFUS STRICT** : Si la question porte sur un autre domaine (famille, commercial, travail, foncier, etc.), réponds :
"Je suis spécialisé en droit pénal guinéen. Cette question relève du [domaine concerné]. Veuillez utiliser l'agent approprié."

Sources prioritaires : Code pénal guinéen, Code de procédure pénale, Constitution 2025.""",

    "commercial": _BASE_RULES + """

## Spécialisation : Droit commercial et droit des affaires guinéens

Tu es EXCLUSIVEMENT spécialisé en droit commercial guinéen : création d'entreprise, contrats commerciaux, SARL/SA/SNC, fonds de commerce, obligations commerciales, faillite, sociétés, commerce international, droit minier/pétrolier côté commercial.

**REFUS STRICT** : Si la question porte sur un autre domaine (famille, pénal, travail, foncier, etc.), réponds :
"Je suis spécialisé en droit commercial guinéen. Cette question relève du [domaine concerné]. Veuillez utiliser l'agent approprié."

Sources prioritaires : Code de commerce guinéen, Code minier, Code pétrolier, lois sur les investissements.""",

    "travail": _BASE_RULES + """

## Spécialisation : Droit du travail guinéen

Tu es EXCLUSIVEMENT spécialisé en droit du travail guinéen : contrat de travail, salaire, SMIG, licenciement, préavis, indemnités, congés, conventions collectives, syndicats, sécurité sociale, accidents du travail, inspection du travail.

**REFUS STRICT** : Si la question porte sur un autre domaine (famille, pénal, commercial, foncier, etc.), réponds :
"Je suis spécialisé en droit du travail guinéen. Cette question relève du [domaine concerné]. Veuillez utiliser l'agent approprié."

Sources prioritaires : Code du travail guinéen, décrets d'application, conventions collectives sectorielles.""",

    "immobilier": _BASE_RULES + """

## Spécialisation : Droit foncier et droit immobilier guinéens

Tu es EXCLUSIVEMENT spécialisé en droit foncier et immobilier guinéen : propriété foncière, titre foncier, immatriculation, bail, location, expulsion, permis de construire, hypothèque, droit de préemption, domaine de l'État, expropriation.

**REFUS STRICT** : Si la question porte sur un autre domaine (famille, pénal, commercial, travail, etc.), réponds :
"Je suis spécialisé en droit foncier et immobilier guinéen. Cette question relève du [domaine concerné]. Veuillez utiliser l'agent approprié."

Sources prioritaires : Code foncier et domanial guinéen, lois sur l'urbanisme, réglementations sur les titres fonciers.""",
}

# Thread pool dédié aux appels RAG (bloquants)
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="rag")

# Cache du pipeline — stocké avec le provider utilisé pour détecter les changements
_pipeline_cache: dict = {"pipeline": None, "provider": None}
# Empêche deux chargements simultanés (préchauffage + première question)
_pipeline_lock = threading.Lock()


def _load_pipeline():
    """
    Charge le pipeline RAG (singleton par provider).
    Si le provider change dans .env, recrée automatiquement le pipeline.
    Supporte Ollama, Anthropic, OpenAI, Mistral.
    """
    rag_provider = settings.RAG_LLM_PROVIDER or settings.LLM_PROVIDER
    if _pipeline_cache["pipeline"] is not None and _pipeline_cache["provider"] == rag_provider:
        return _pipeline_cache["pipeline"]
    with _pipeline_lock:
        return _load_pipeline_locked(rag_provider)


def _load_pipeline_locked(rag_provider: str):
    global _pipeline_cache

    model_path = settings.RAG_MODEL_PATH

    # Retourner le cache seulement si le provider n'a pas changé
    if _pipeline_cache["pipeline"] is not None and _pipeline_cache["provider"] == rag_provider:
        return _pipeline_cache["pipeline"]

    # Charger le pipeline (ou recharger si provider changé)
    if model_path not in sys.path:
        sys.path.insert(0, f"{model_path}/04_pipeline")

    import warnings
    warnings.filterwarnings("ignore")

    try:
        import transformers
        transformers.logging.set_verbosity_error()
    except Exception:
        pass

    # Injecter les clés API dans os.environ pour que rag.py les lise via os.getenv()
    # (pydantic_settings ne les met pas dans os.environ automatiquement)
    import os
    if settings.ANTHROPIC_API_KEY:
        os.environ.setdefault("ANTHROPIC_API_KEY", settings.ANTHROPIC_API_KEY)
        os.environ["ANTHROPIC_MODEL"] = settings.ANTHROPIC_MODEL
    if settings.OPENAI_API_KEY:
        os.environ.setdefault("OPENAI_API_KEY", settings.OPENAI_API_KEY)
        os.environ["OPENAI_MODEL"] = settings.OPENAI_MODEL
    if settings.MISTRAL_API_KEY:
        os.environ.setdefault("MISTRAL_API_KEY", settings.MISTRAL_API_KEY)

    # Paramètres supplémentaires pour Ollama
    extra_kwargs: dict = {}
    if rag_provider == "ollama":
        extra_kwargs["ollama_base_url"] = settings.OLLAMA_BASE_URL
        extra_kwargs["ollama_model"]    = settings.RAG_OLLAMA_MODEL or settings.OLLAMA_MODEL

    from rag import JusticIAPipeline  # type: ignore
    pipeline = JusticIAPipeline(provider=rag_provider, verbose=False, **extra_kwargs)

    _pipeline_cache["pipeline"] = pipeline
    _pipeline_cache["provider"] = rag_provider

    import logging
    logging.getLogger("justicia").info(f"RAG pipeline chargé — provider: {rag_provider}")

    return pipeline


def is_pipeline_loaded() -> bool:
    return _pipeline_cache["pipeline"] is not None


async def warmup_pipeline() -> None:
    """Charge les modèles au démarrage (en arrière-plan) pour que la première
    question n'attende pas le téléchargement et le chargement (~1–3 min)."""
    import logging
    log = logging.getLogger("justicia")
    try:
        await asyncio.get_running_loop().run_in_executor(_executor, _load_pipeline)
        print("✅ RAG préchargé (modèles en mémoire)")
    except Exception as exc:  # l'API reste utilisable : chargement retenté à la 1re question
        log.warning(f"Préchargement RAG échoué : {exc}")
        print(f"⚠️  Préchargement RAG échoué : {exc}")


def _run_rag_sync(
    question:       str,
    agent_id:       str,
    top_k:          int                  = 10,
    custom_domains: Optional[list[str]]  = None,
    history:        Optional[list[dict]] = None,
    system_prompt:  Optional[str]        = None,
    request_id:     Optional[str]        = None,
) -> tuple[str, list[dict]]:
    """Exécution synchrone du pipeline RAG (appelé depuis thread pool)."""
    pipeline = _load_pipeline()

    if custom_domains is not None:
        domaine = custom_domains[0] if len(custom_domains) == 1 else None
    else:
        domaine = AGENT_DOMAIN_MAP.get(agent_id)

    return pipeline.answer(
        question,
        domaine       = domaine,
        top_k         = top_k,
        history       = history or [],
        system_prompt = system_prompt,
        request_id    = request_id,
    )


async def ask_rag(
    question:       str,
    agent_id:       str                  = "jurisprudence",
    top_k:          int                  = 10,
    custom_domains: Optional[list[str]]  = None,
    history:        Optional[list[dict]] = None,
    system_prompt:  Optional[str]        = None,
    request_id:     Optional[str]        = None,
) -> tuple[str, list[dict]]:
    """
    Appel asynchrone au pipeline RAG.
    - agents intégrés    : filtre par AGENT_DOMAIN_MAP[agent_id]
    - agents personnalisés : custom_domains liste de domaines
    - system_prompt      : prompt système de l'agent (surcharge le défaut)
    - history            : derniers messages [{role, content}] pour le contexte
    Retourne (réponse_texte, sources_articles).
    """
    loop = asyncio.get_event_loop()
    future = loop.run_in_executor(
        _executor, _run_rag_sync, question, agent_id, top_k, custom_domains, history, system_prompt, request_id
    )
    return await asyncio.wait_for(future, timeout=settings.RAG_REQUEST_TIMEOUT_SECONDS)


def format_sources(articles: list[dict]) -> list[dict]:
    """Formate les sources pour la réponse API."""
    return [
        {
            "source_id":   art.get("_source_id", f"S{i}"),
            "article_ref": art.get("article_ref", ""),
            "nom_doc":     art.get("nom_doc", ""),
            "numero":      art.get("numero", ""),
            "date":        art.get("date", ""),
            "domaine":     art.get("domaine", ""),
            "score":       art.get("score", 0),
            "page":        art.get("page", ""),
            "source":      art.get("source", ""),
            "source_url":  art.get("source_url", ""),
            "source_file": art.get("source_file", ""),
            "source_status": art.get("source_status", "inconnu"),
            "texte":       art.get("texte", "")[:300],
        }
        for i, art in enumerate(articles, 1)
    ]

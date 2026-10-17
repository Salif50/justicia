"""
Service LLM centralisé et universel — JusticIA
===============================================
Un seul point d'entrée pour tous les appels LLM, quelle que soit la source.

Providers supportés (configurés via LLM_PROVIDER dans .env) :
  - ollama     → Self-hosted, 100% local, ZÉRO donnée externe (RECOMMANDÉ)
  - mistral    → API Mistral (France, RGPD, modèles natifs français)
  - anthropic  → Claude (Anthropic)
  - openai     → GPT-4o (OpenAI)
  - compatible → Toute API compatible OpenAI (LocalAI, LM Studio, vLLM…)

Usage :
    from app.services.llm_service import llm

    # Appel simple (synchrone, dans un thread pool)
    result = llm.call(system="Tu es expert juridique", user="Rédige un contrat")

    # Appel asynchrone (depuis un endpoint FastAPI)
    result = await llm.acall(system="...", user="...")
"""
from __future__ import annotations

import asyncio
import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

from app.config import settings

log = logging.getLogger(__name__)

_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="llm")


class LLMService:
    """
    Service LLM multi-provider.
    Instancié une seule fois comme singleton (llm = LLMService()).
    """

    # ── Appel synchrone (base) ────────────────────────────────────────────────

    def call(
        self,
        system:      str,
        user:        str,
        *,
        json_mode:   bool = False,
        temperature: float = 0.2,
        max_tokens:  int   = 6000,
        provider:    Optional[str] = None,
        model:       Optional[str] = None,
    ) -> str:
        """
        Appel LLM synchrone. `model` : modèle OpenAI à utiliser à la place du modèle par
        défaut (ignoré par les autres fournisseurs). À exécuter dans un thread pool (jamais dans l'event loop).
        Retourne le texte généré.
        """
        p = (provider or settings.LLM_PROVIDER).lower()

        try:
            if p == "ollama":
                return self._call_ollama(system, user, temperature, max_tokens)
            elif p == "mistral":
                return self._call_mistral(system, user, temperature, max_tokens)
            elif p == "anthropic":
                return self._call_anthropic(system, user, temperature, max_tokens)
            elif p == "compatible":
                return self._call_compatible(system, user, temperature, max_tokens, json_mode)
            else:  # openai (défaut)
                return self._call_openai(system, user, temperature, max_tokens, json_mode, model)
        except Exception as exc:
            log.error("LLM error (provider=%s): %s", p, exc)
            raise

    # ── Appel asynchrone ──────────────────────────────────────────────────────

    async def acall(
        self,
        system:      str,
        user:        str,
        *,
        json_mode:   bool = False,
        temperature: float = 0.2,
        max_tokens:  int   = 6000,
        provider:    Optional[str] = None,
        model:       Optional[str] = None,
    ) -> str:
        """Appel LLM asynchrone (délègue au thread pool pour ne pas bloquer l'event loop)."""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            _executor,
            lambda: self.call(
                system,
                user,
                json_mode=json_mode,
                temperature=temperature,
                max_tokens=max_tokens,
                provider=provider,
                model=model,
            ),
        )

    # ══════════════════════════════════════════════════════════════════════════
    #  PROVIDERS
    # ══════════════════════════════════════════════════════════════════════════

    # ── Ollama (self-hosted, 100% local) ──────────────────────────────────────

    def _call_ollama(self, system: str, user: str, temperature: float, max_tokens: int) -> str:
        """
        Appel vers Ollama local via l'API compatible OpenAI.
        Ollama doit tourner sur OLLAMA_BASE_URL (défaut : http://localhost:11434).
        Le modèle est défini par OLLAMA_MODEL (ex: qwen2.5:72b, llama3.1:70b…)
        """
        from openai import OpenAI

        client = OpenAI(
            base_url=f"{settings.OLLAMA_BASE_URL}/v1",
            api_key="ollama",  # Ollama n'a pas besoin de vraie clé
        )

        response = client.chat.completions.create(
            model=settings.OLLAMA_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    # ── Mistral API (France, RGPD, natif français) ────────────────────────────

    def _call_mistral(self, system: str, user: str, temperature: float, max_tokens: int) -> str:
        """
        Appel vers l'API Mistral (api.mistral.ai).
        Entreprise française → données restent en Europe (RGPD).
        Modèles natifs français → excellent pour le droit guinéen en français.
        Modèle : MISTRAL_MODEL (défaut : mistral-large-latest)
        """
        from mistralai import Mistral

        client = Mistral(api_key=settings.MISTRAL_API_KEY)
        response = client.chat.complete(
            model=settings.MISTRAL_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        return response.choices[0].message.content or ""

    # ── Anthropic Claude ──────────────────────────────────────────────────────

    def _call_anthropic(self, system: str, user: str, temperature: float, max_tokens: int) -> str:
        import anthropic
        client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        response = client.messages.create(
            model=settings.ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=[{"role": "user", "content": user}],
            temperature=temperature,
        )
        return response.content[0].text

    # ── OpenAI GPT ────────────────────────────────────────────────────────────

    def _call_openai(
        self, system: str, user: str, temperature: float, max_tokens: int, json_mode: bool,
        model: Optional[str] = None,
    ) -> str:
        from openai import OpenAI
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        kwargs: dict = dict(
            model=model or settings.OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    # ── API compatible OpenAI (LocalAI, LM Studio, vLLM, Groq…) ─────────────

    def _call_compatible(
        self, system: str, user: str, temperature: float, max_tokens: int, json_mode: bool
    ) -> str:
        """
        Toute API qui implémente le format OpenAI (base_url personnalisable).
        LLM_COMPATIBLE_BASE_URL : URL de l'API (ex: http://localhost:8080/v1)
        LLM_COMPATIBLE_MODEL    : nom du modèle
        LLM_COMPATIBLE_API_KEY  : clé (peut être vide)
        """
        from openai import OpenAI
        client = OpenAI(
            base_url=settings.LLM_COMPATIBLE_BASE_URL,
            api_key=settings.LLM_COMPATIBLE_API_KEY or "none",
        )
        kwargs: dict = dict(
            model=settings.LLM_COMPATIBLE_MODEL,
            messages=[
                {"role": "system", "content": system},
                {"role": "user",   "content": user},
            ],
            temperature=temperature,
            max_tokens=max_tokens,
        )
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    # ── Infos utiles ──────────────────────────────────────────────────────────

    def provider_info(self) -> dict:
        """Retourne des infos sur le provider actif (pour le healthcheck)."""
        p = settings.LLM_PROVIDER.lower()
        info: dict = {"provider": p}

        if p == "ollama":
            info["base_url"] = settings.OLLAMA_BASE_URL
            info["model"]    = settings.OLLAMA_MODEL
            info["local"]    = True
            info["privacy"]  = "100% local — aucune donnée externe"
        elif p == "mistral":
            info["model"]   = settings.MISTRAL_MODEL
            info["local"]   = False
            info["privacy"] = "Données hébergées en Europe (RGPD Mistral AI)"
        elif p == "anthropic":
            info["model"]   = settings.ANTHROPIC_MODEL
            info["local"]   = False
            info["privacy"] = "Données envoyées à Anthropic (USA)"
        elif p == "openai":
            info["model"]   = settings.OPENAI_MODEL
            info["local"]   = False
            info["privacy"] = "Données envoyées à OpenAI (USA)"
        elif p == "compatible":
            info["base_url"] = settings.LLM_COMPATIBLE_BASE_URL
            info["model"]    = settings.LLM_COMPATIBLE_MODEL
            info["local"]    = True
            info["privacy"]  = "Dépend de votre déploiement"

        return info

    async def health_check(self) -> dict:
        """Teste si le LLM répond correctement."""
        try:
            resp = await self.acall(
                system="Tu es un assistant.",
                user="Réponds juste 'ok'.",
                max_tokens=10,
            )
            return {"status": "ok", "response": resp.strip()[:20], **self.provider_info()}
        except Exception as exc:
            return {"status": "error", "error": str(exc), **self.provider_info()}


# ── Singleton ─────────────────────────────────────────────────────────────────
llm = LLMService()

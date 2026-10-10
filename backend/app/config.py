from pydantic_settings import BaseSettings
from pathlib import Path

# backend/app/config.py → JusticIA/model  (valable en local et dans Docker)
_DEFAULT_MODEL_PATH = str(Path(__file__).resolve().parents[2] / "model")


class Settings(BaseSettings):
    # ── App ───────────────────────────────────────────────────────────────────
    APP_NAME: str = "JusticIA"
    APP_ENV:  str = "development"
    FRONTEND_URL: str = "http://localhost:4200"
    BACKEND_URL:  str = "http://localhost:8000"
    # Origines CORS supplémentaires, séparées par des virgules
    # ex: https://justicia.vercel.app,https://justicia.gn
    CORS_ORIGINS: str = ""

    # ── Mosagix Pay ──────────────────────────────────────────────────────────
    # Les deux secrets restent exclusivement côté backend.
    MOSAGIX_API_URL: str = ""
    MOSAGIX_API_KEY: str = ""
    MOSAGIX_WEBHOOK_SECRET: str = ""
    APP_PUBLIC_FRONTEND_URL: str = ""
    APP_PUBLIC_BACKEND_URL: str = ""

    # ── Database ──────────────────────────────────────────────────────────────
    DATABASE_URL:      str
    DATABASE_URL_SYNC: str

    # ── JWT ───────────────────────────────────────────────────────────────────
    SECRET_KEY:                    str
    ALGORITHM:                     str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES:   int = 60
    REFRESH_TOKEN_EXPIRE_DAYS:     int = 7

    # ── LLM Provider ─────────────────────────────────────────────────────────
    # Valeurs : "ollama" | "mistral" | "anthropic" | "openai" | "compatible"
    # RECOMMANDÉ LONG TERME : "ollama" (self-hosted, 100% privé)
    LLM_PROVIDER: str = "ollama"

    # ── Ollama (self-hosted — OPTION RECOMMANDÉE) ─────────────────────────────
    # Installer : https://ollama.ai
    # Modèles recommandés (qualité décroissante) :
    #   qwen2.5:72b        (meilleur multilingue+raisonnement, 48GB VRAM)
    #   llama3.1:70b       (très bon, 48GB VRAM)
    #   mistral-nemo:12b   (natif français, léger, 8GB VRAM)
    #   llama3.2:3b        (très léger, CPU possible)
    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL:    str = "qwen2.5:14b"

    # ── Mistral API (France, RGPD — option intermédiaire) ────────────────────
    # Données hébergées en Europe, entreprise française
    # Modèles : mistral-large-latest | mistral-small-latest | open-mistral-nemo
    MISTRAL_API_KEY: str = ""
    MISTRAL_MODEL:   str = "mistral-large-latest"

    # ── Anthropic Claude ──────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    ANTHROPIC_MODEL:   str = "claude-opus-4-8"

    # ── OpenAI GPT ────────────────────────────────────────────────────────────
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL:   str = "gpt-4o"

    # ── API compatible OpenAI (LocalAI, LM Studio, vLLM, Groq…) ─────────────
    LLM_COMPATIBLE_BASE_URL: str = "http://localhost:8080/v1"
    LLM_COMPATIBLE_MODEL:    str = "local-model"
    LLM_COMPATIBLE_API_KEY:  str = ""

    # ── RAG ───────────────────────────────────────────────────────────────────
    # Ne jamais hardcoder un chemin Mac : en local = ../model, en Docker = /app/model
    RAG_MODEL_PATH:       str = _DEFAULT_MODEL_PATH
    # Provider LLM pour le pipeline RAG interne (peut être différent du LLM principal)
    # Laisser vide pour utiliser LLM_PROVIDER
    RAG_LLM_PROVIDER:     str = ""
    RAG_OLLAMA_MODEL:     str = ""   # Si vide, utilise OLLAMA_MODEL
    RAG_REQUEST_TIMEOUT_SECONDS: int = 120

    # ── Google OAuth ──────────────────────────────────────────────────────────
    GOOGLE_CLIENT_ID:     str = ""
    GOOGLE_CLIENT_SECRET: str = ""

    # ── Email ─────────────────────────────────────────────────────────────────
    SMTP_HOST:        str = "smtp.gmail.com"
    SMTP_PORT:        int = 587
    SMTP_USER:        str = ""
    SMTP_PASSWORD:    str = ""
    EMAILS_FROM_NAME: str = "JusticIA"
    # Désactivé par défaut : tant que False, les e-mails sont seulement journalisés.
    EMAILS_ENABLED:   bool = False

    model_config = {"env_file": Path(__file__).parent.parent / ".env", "extra": "ignore"}

    def allowed_origins(self) -> list[str]:
        raw = [
            self.FRONTEND_URL,
            self.APP_PUBLIC_FRONTEND_URL,
            "http://localhost:4200",
            "http://localhost:4201",
            *self.CORS_ORIGINS.split(","),
        ]
        seen: list[str] = []
        for origin in raw:
            cleaned = origin.strip().rstrip("/")
            if cleaned and cleaned not in seen:
                seen.append(cleaned)
        return seen


settings = Settings()

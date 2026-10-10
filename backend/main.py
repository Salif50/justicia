"""
JusticIA — Backend FastAPI
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from sqlalchemy import text

from app.config import settings
from app.core.security_middleware import RateLimitMiddleware, SecurityHeadersMiddleware
from app.database import Base, engine, AsyncSessionLocal
from app.models import content  # noqa: F401 — enregistre les modèles dans Base.metadata
from app.models import custom_agent  # noqa: F401
from app.models import case  # noqa: F401
from app.models import notification  # noqa: F401
from app.models import archive  # noqa: F401
from app.models import agenda  # noqa: F401
from app.models import generation as generation_model  # noqa: F401
from app.models import procedure as procedure_model  # noqa: F401
from app.models import moderation as moderation_model  # noqa: F401
from app.routers import admin, admin_users, agenda, agents, auth, billing, cases, comparison, contact, conversation, encyclopedia, generation, notifications, procedures, public, resume, search, subscription, translation, user
from app.seed import seed_content


async def _run_migrations(conn) -> None:
    """Migrations manuelles pour les colonnes ajoutées après la création initiale."""
    migrations = [
        # pricing_plans : plan_id et daily_limit ajoutés après création initiale
        "ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS plan_id VARCHAR(50) UNIQUE",
        "ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS daily_limit INTEGER DEFAULT -1",
        # user_preferences : ephemeral_mode ajouté après création initiale
        "ALTER TABLE user_preferences ADD COLUMN IF NOT EXISTS ephemeral_mode BOOLEAN DEFAULT FALSE",
        # user_stats : colonnes quota journalier
        "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS daily_questions_count INTEGER DEFAULT 0",
        "ALTER TABLE user_stats ADD COLUMN IF NOT EXISTS daily_reset_date DATE",
        # custom_agents : colonnes ajoutées après création initiale
        "ALTER TABLE custom_agents ADD COLUMN IF NOT EXISTS domains JSONB DEFAULT '[]'",
        # users : profil utilisateur
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_type VARCHAR(50)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_completed BOOLEAN DEFAULT FALSE",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_survey JSONB",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS organization VARCHAR(200)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS bar_number VARCHAR(100)",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)",
        # users : modération admin
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_limit_override INTEGER",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS admin_notes TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ",
        # pricing_plans : feature flags
        "ALTER TABLE pricing_plans ADD COLUMN IF NOT EXISTS feature_flags TEXT DEFAULT '[]'",
        # custom_agents : prompt système par agent
        "ALTER TABLE custom_agents ADD COLUMN IF NOT EXISTS system_prompt TEXT DEFAULT ''",
        # builtin_agent_configs : table pour prompts admin des agents intégrés
        """CREATE TABLE IF NOT EXISTS builtin_agent_configs (
            agent_id    VARCHAR(80) PRIMARY KEY,
            system_prompt TEXT NOT NULL,
            updated_at  TIMESTAMPTZ DEFAULT NOW(),
            updated_by  VARCHAR(150) DEFAULT 'system'
        )""",
    ]
    # case_notes est une nouvelle table — create_all s'en charge, pas besoin de ALTER
    for sql in migrations:
        try:
            await conn.execute(text(sql))
        except Exception as e:
            print(f"⚠️  Migration ignorée ({e})")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Créer toutes les tables au démarrage
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Appliquer les migrations de colonnes manquantes
        await _run_migrations(conn)
    # Insérer les données initiales si les tables sont vides
    async with AsyncSessionLocal() as db:
        await seed_content(db)

    from pathlib import Path
    model_root = Path(settings.RAG_MODEL_PATH)
    if not (model_root / "03_vectorstore").exists() or not (model_root / "04_pipeline" / "rag.py").exists():
        print(f"⚠️  RAG incomplet — RAG_MODEL_PATH={model_root}")
        print("    Attendu : model/03_vectorstore + model/04_pipeline/rag.py")
    else:
        print(f"✅ RAG prêt — {model_root}")

    print(f"✅ JusticIA backend démarré — {settings.APP_ENV}")
    yield
    await engine.dispose()


app = FastAPI(
    title="JusticIA API",
    description="Backend de l'assistant juridique guinéen JusticIA",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Ordre important : les middlewares s'appliquent en ordre inverse (LIFO)
# SecurityHeaders s'applique en dernier (après tous les autres)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins(),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-Requested-With"],
    expose_headers=["X-RateLimit-Remaining"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
PREFIX = "/api"

app.include_router(auth.router,         prefix=PREFIX)
app.include_router(conversation.router, prefix=PREFIX)
app.include_router(user.router,         prefix=PREFIX)
app.include_router(subscription.router, prefix=PREFIX)
app.include_router(billing.router,      prefix=PREFIX)
app.include_router(billing.webhook_router, prefix=PREFIX)
app.include_router(agents.router,       prefix=PREFIX)
app.include_router(cases.router,        prefix=PREFIX)
app.include_router(contact.router,       prefix=PREFIX)
app.include_router(search.router,        prefix=PREFIX)
app.include_router(notifications.router, prefix=PREFIX)
app.include_router(resume.router,        prefix=PREFIX)
app.include_router(agenda.router,        prefix=PREFIX)
app.include_router(generation.router,    prefix=PREFIX)
app.include_router(comparison.router,    prefix=PREFIX)
app.include_router(translation.router,   prefix=PREFIX)
app.include_router(encyclopedia.router,  prefix=PREFIX)
app.include_router(admin.router,         prefix=PREFIX)
app.include_router(admin_users.router,   prefix=PREFIX)
app.include_router(public.router,        prefix=PREFIX)
app.include_router(procedures.router,    prefix=PREFIX)


@app.get("/", tags=["Health"])
async def root():
    return {"status": "ok", "app": settings.APP_NAME, "version": "1.0.0"}


@app.get("/health", tags=["Health"])
async def health():
    from pathlib import Path
    from app.services.llm_service import llm

    model_root = Path(settings.RAG_MODEL_PATH)
    rag_ok = (model_root / "03_vectorstore").exists() and (model_root / "04_pipeline" / "rag.py").exists()
    return {
        "status":   "healthy",
        "app":      settings.APP_NAME,
        "env":      settings.APP_ENV,
        "llm":      llm.provider_info(),
        "rag": {
            "path": str(model_root),
            "ready": rag_ok,
        },
    }


@app.get("/api/llm/health", tags=["Health"])
async def llm_health():
    """Vérifie que le LLM répond correctement (teste un appel réel)."""
    from app.services.llm_service import llm
    return await llm.health_check()

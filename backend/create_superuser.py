#!/usr/bin/env python3
"""
Script de création d'un superuser (administrateur) pour JusticIA.

Usage :
    python create_superuser.py
    python create_superuser.py --email admin@justicia.gn --name "Alpha Diallo" --password MonMotDePasse123
"""
import argparse
import asyncio
import getpass
import sys
import uuid

import asyncpg
import bcrypt

from app.config import settings


# ── Helpers ──────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def validate_password(password: str) -> None:
    if len(password) < 8:
        print("  ✗ Le mot de passe doit contenir au moins 8 caractères.")
        sys.exit(1)
    if not any(c.isupper() for c in password):
        print("  ✗ Le mot de passe doit contenir au moins une majuscule.")
        sys.exit(1)
    if not any(c.isdigit() for c in password):
        print("  ✗ Le mot de passe doit contenir au moins un chiffre.")
        sys.exit(1)


# ── Logique principale ────────────────────────────────────────────────────────

async def create_superuser(email: str, name: str, password: str) -> None:
    # Convertir l'URL asyncpg (retirer le préfixe SQLAlchemy si présent)
    db_url = settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")

    conn = await asyncpg.connect(db_url)
    try:
        # Vérifier si l'email existe déjà
        existing = await conn.fetchrow("SELECT id, role FROM users WHERE email = $1", email)

        if existing:
            if existing["role"] == "admin":
                print(f"\n  ⚠  L'utilisateur '{email}' est déjà administrateur.")
            else:
                # Promouvoir le compte existant
                await conn.execute(
                    "UPDATE users SET role='admin', is_active=true, is_verified=true, "
                    "password_hash=$1 WHERE email=$2",
                    hash_password(password), email,
                )
                print(f"\n  ✓  Le compte '{email}' a été promu administrateur.")
        else:
            # Créer le nouveau compte admin
            user_id = uuid.uuid4()
            password_hash = hash_password(password)

            await conn.execute(
                """
                INSERT INTO users (id, email, name, password_hash, auth_provider,
                                   language, role, is_active, is_verified, created_at, updated_at)
                VALUES ($1, $2, $3, $4, 'local', 'fr', 'admin', true, true,
                        NOW() AT TIME ZONE 'UTC', NOW() AT TIME ZONE 'UTC')
                """,
                user_id, email, name, password_hash,
            )

            # Créer les entrées user_preferences avec toutes les valeurs par défaut
            await conn.execute(
                """
                INSERT INTO user_preferences (
                    user_id, save_conversations, enable_notifications, auto_save_chat,
                    theme, compact_mode, session_timeout, two_factor_auth,
                    email_notifications, push_notifications, share_analytics,
                    show_online_status, newsletter
                ) VALUES ($1, true, true, true, 'light', false, 30, false, true, false, true, true, false)
                ON CONFLICT DO NOTHING
                """,
                user_id,
            )
            # Créer les entrées user_stats avec toutes les valeurs par défaut
            await conn.execute(
                """
                INSERT INTO user_stats (
                    user_id, conversations_count, questions_count,
                    agents_used_count, documents_count
                ) VALUES ($1, 0, 0, 0, 0)
                ON CONFLICT DO NOTHING
                """,
                user_id,
            )

            print(f"\n  ✓  Superuser créé avec succès !")
            print(f"     ID    : {user_id}")
            print(f"     Email : {email}")
            print(f"     Nom   : {name}")
            print(f"     Rôle  : admin")

    finally:
        await conn.close()


# ── Point d'entrée ────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Créer un superuser JusticIA")
    parser.add_argument("--email",    help="Email de l'administrateur")
    parser.add_argument("--name",     help="Nom complet de l'administrateur")
    parser.add_argument("--password", help="Mot de passe (si omis, demandé interactivement)")
    args = parser.parse_args()

    print("\n" + "═" * 50)
    print("   JusticIA — Création de Superuser")
    print("═" * 50)

    # Collecter les infos manquantes interactivement
    email = args.email
    if not email:
        email = input("\n  Email : ").strip()
    if not email or "@" not in email:
        print("  ✗ Email invalide.")
        sys.exit(1)

    name = args.name
    if not name:
        name = input("  Nom complet : ").strip()
    if not name:
        print("  ✗ Le nom ne peut pas être vide.")
        sys.exit(1)

    password = args.password
    if not password:
        password = getpass.getpass("  Mot de passe : ")
        confirm  = getpass.getpass("  Confirmer le mot de passe : ")
        if password != confirm:
            print("  ✗ Les mots de passe ne correspondent pas.")
            sys.exit(1)

    validate_password(password)

    print("\n  Création en cours...")
    asyncio.run(create_superuser(email, name, password))
    print("\n  Connectez-vous sur http://localhost:4200/connexion")
    print("═" * 50 + "\n")


if __name__ == "__main__":
    main()

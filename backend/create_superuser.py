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
    """Crée (ou promeut) un administrateur via les modèles de l'application :
    toutes les valeurs par défaut des colonnes s'appliquent, et tout est fait
    dans une seule transaction (pas de compte à moitié créé en cas d'erreur)."""
    import main  # noqa: F401 — enregistre tous les modèles (relations SQLAlchemy)
    from sqlalchemy import select

    from app.database import AsyncSessionLocal, engine
    from app.models.user import User, UserPreferences, UserStats

    try:
        async with AsyncSessionLocal() as db, db.begin():
            user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()

            if user and user.role == "admin":
                print(f"\n  ⚠  L'utilisateur '{email}' est déjà administrateur.")
                return

            if user:
                user.role = "admin"
                user.is_active = True
                user.is_verified = True
                user.password_hash = hash_password(password)
                print(f"\n  ✓  Le compte '{email}' a été promu administrateur.")
                return

            user = User(
                id=uuid.uuid4(),
                email=email,
                name=name,
                password_hash=hash_password(password),
                auth_provider="local",
                role="admin",
                is_active=True,
                is_verified=True,
                profile_completed=True,
            )
            db.add(user)
            await db.flush()
            db.add(UserPreferences(user_id=user.id))
            db.add(UserStats(user_id=user.id))

        print("\n  ✓  Superuser créé avec succès !")
        print(f"     ID    : {user.id}")
        print(f"     Email : {email}")
        print(f"     Nom   : {name}")
        print("     Rôle  : admin")
    finally:
        await engine.dispose()


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
    print(f"\n  Connectez-vous sur {settings.FRONTEND_URL.rstrip('/')}/login")
    print("═" * 50 + "\n")


if __name__ == "__main__":
    main()

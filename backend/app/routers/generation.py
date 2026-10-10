"""
Génération et analyse de contrats juridiques conformes au droit guinéen.

Endpoints :
  GET    /generation/templates          — templates + champs formulaire
  POST   /generation/generate           — génère un contrat via RAG + LLM
  POST   /generation/analyze            — analyse un PDF uploadé (audit conformité)
  GET    /generation/archives           — liste des documents de l'utilisateur
  GET    /generation/archives/{id}      — détail d'un document
  DELETE /generation/archives/{id}      — suppression
"""
from __future__ import annotations

import asyncio
import io
import json
import re
import uuid as _uuid
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from sqlalchemy import select

from app.config import settings
from app.core.deps import CurrentUser, DB
from app.models.generation import GeneratedDocument
from app.schemas.generation import (
    AnalyzeResponse,
    DocumentArchiveDetail,
    DocumentArchiveOut,
    GenerateRequest,
    GenerateResponse,
)
from app.services.llm_service import llm
from app.services.rag_service import ask_rag, format_sources

router   = APIRouter(prefix="/generation", tags=["Génération"])
_executor = ThreadPoolExecutor(max_workers=4, thread_name_prefix="gen_ai")

ALLOWED_MIME  = {"application/pdf", "application/x-pdf"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 Mo

# ── Mapping type de contrat → domaine RAG ─────────────────────────────────────
CONTRACT_DOMAIN_MAP: dict[str, str | None] = {
    "travail":          "Droit du travail",
    "bail":             "Droit foncier",
    "vente":            "Droit civil",
    "prestation":       "Economie",
    "societe":          "Droit des affaires",
    "pret":             "Droit civil",
    "mandat":           "Droit civil",
    "confidentialite":  "Droit des affaires",
    "partenariat":      "Droit des affaires",
    "transport":        "Droit commercial",
    "donation":         "Droit civil",
    "reconnaissance_dette": "Droit civil",
    "association":      "Droit associatif",
    "marche_travaux":   "Droit civil",
    "franchise":        "Droit commercial",
    "cession_creance":  "Droit civil",
}

CONTRACT_LABELS: dict[str, str] = {
    "travail":          "Contrat de travail",
    "bail":             "Contrat de bail",
    "vente":            "Contrat de vente",
    "prestation":       "Contrat de prestation de service",
    "societe":          "Statuts de société (SARL/SA)",
    "pret":             "Contrat de prêt",
    "mandat":           "Contrat de mandat",
    "confidentialite":  "Accord de confidentialité (NDA)",
    "partenariat":      "Accord de partenariat",
    "transport":        "Contrat de transport",
    "donation":         "Acte de donation",
    "reconnaissance_dette": "Reconnaissance de dette",
    "association":      "Statuts d'association",
    "marche_travaux":   "Marché de travaux / BTP",
    "franchise":        "Contrat de franchise",
    "cession_creance":  "Cession de créance",
}

# ── Templates ─────────────────────────────────────────────────────────────────
TEMPLATES = [
    # ── TRAVAIL & SOCIAL ─────────────────────────────────────────────────────
    {
        "id": "travail",
        "label": "Contrat de travail",
        "description": "CDI/CDD conforme au Code du travail L-2014-072",
        "icon": "briefcase",
        "category": "Travail & Social",
        "domain": "Droit du travail",
        "fields": [
            {"key": "employeur_nom",       "label": "Nom / Raison sociale de l'employeur", "required": True,  "type": "text"},
            {"key": "employeur_adresse",   "label": "Adresse de l'employeur",               "required": True,  "type": "text"},
            {"key": "employeur_rccm",      "label": "RCCM de l'employeur",                  "required": False, "type": "text"},
            {"key": "employeur_nif",       "label": "NIF de l'employeur",                   "required": False, "type": "text"},
            {"key": "employe_nom",         "label": "Nom de l'employé",                     "required": True,  "type": "text"},
            {"key": "employe_prenom",      "label": "Prénom de l'employé",                  "required": True,  "type": "text"},
            {"key": "employe_adresse",     "label": "Adresse de l'employé",                 "required": True,  "type": "text"},
            {"key": "employe_cin",         "label": "N° CIN de l'employé",                  "required": False, "type": "text"},
            {"key": "employe_nationalite", "label": "Nationalité de l'employé",             "required": False, "type": "text"},
            {"key": "type_contrat",        "label": "Type de contrat (CDI / CDD)",           "required": True,  "type": "select", "options": ["CDI", "CDD"]},
            {"key": "duree",               "label": "Durée (si CDD, ex: 6 mois)",            "required": False, "type": "text"},
            {"key": "date_debut",          "label": "Date de début",                         "required": True,  "type": "date"},
            {"key": "poste",               "label": "Intitulé du poste",                     "required": True,  "type": "text"},
            {"key": "salaire_mensuel",     "label": "Salaire mensuel brut (FG)",             "required": True,  "type": "number"},
            {"key": "lieu_travail",        "label": "Lieu de travail",                       "required": True,  "type": "text"},
            {"key": "periode_essai",       "label": "Période d'essai (ex: 3 mois)",          "required": False, "type": "text"},
            {"key": "duree_hebdomadaire",  "label": "Durée hebdomadaire de travail (h)",     "required": False, "type": "number"},
        ],
    },
    # ── IMMOBILIER & FONCIER ─────────────────────────────────────────────────
    {
        "id": "bail",
        "label": "Contrat de bail",
        "description": "Bail d'habitation ou commercial conforme au Code foncier",
        "icon": "home",
        "category": "Immobilier & Foncier",
        "domain": "Droit foncier",
        "fields": [
            {"key": "bailleur_nom",      "label": "Nom du bailleur",              "required": True,  "type": "text"},
            {"key": "bailleur_adresse",  "label": "Adresse du bailleur",          "required": True,  "type": "text"},
            {"key": "locataire_nom",     "label": "Nom du locataire",             "required": True,  "type": "text"},
            {"key": "locataire_adresse", "label": "Adresse du locataire",         "required": True,  "type": "text"},
            {"key": "locataire_cin",     "label": "N° CIN du locataire",          "required": False, "type": "text"},
            {"key": "bien_adresse",      "label": "Adresse du bien loué",         "required": True,  "type": "text"},
            {"key": "bien_superficie",   "label": "Superficie (m²)",              "required": False, "type": "number"},
            {"key": "usage",             "label": "Usage",                        "required": True,  "type": "select", "options": ["Habitation", "Commercial", "Mixte"]},
            {"key": "duree_bail",        "label": "Durée du bail",                "required": True,  "type": "text"},
            {"key": "loyer_mensuel",     "label": "Loyer mensuel (FG)",           "required": True,  "type": "number"},
            {"key": "depot_garantie",    "label": "Dépôt de garantie (FG)",       "required": False, "type": "number"},
            {"key": "date_entree",       "label": "Date d'entrée dans les lieux", "required": True,  "type": "date"},
        ],
    },
    {
        "id": "marche_travaux",
        "label": "Marché de travaux / BTP",
        "description": "Contrat de construction et travaux de BTP",
        "icon": "hard-hat",
        "category": "Immobilier & Foncier",
        "domain": "Droit civil",
        "fields": [
            {"key": "maitre_ouvrage",      "label": "Maître d'ouvrage (commanditaire)",    "required": True,  "type": "text"},
            {"key": "maitre_adresse",      "label": "Adresse du maître d'ouvrage",          "required": True,  "type": "text"},
            {"key": "entrepreneur",        "label": "Entrepreneur / Entreprise de BTP",     "required": True,  "type": "text"},
            {"key": "entrepreneur_adresse","label": "Adresse de l'entrepreneur",            "required": True,  "type": "text"},
            {"key": "entrepreneur_rccm",   "label": "RCCM de l'entrepreneur",               "required": False, "type": "text"},
            {"key": "description_travaux", "label": "Description des travaux",              "required": True,  "type": "textarea"},
            {"key": "lieu_chantier",       "label": "Lieu du chantier",                     "required": True,  "type": "text"},
            {"key": "delai_execution",     "label": "Délai d'exécution",                    "required": True,  "type": "text"},
            {"key": "montant_total",       "label": "Montant total des travaux (FG)",       "required": True,  "type": "number"},
            {"key": "modalites_paiement",  "label": "Modalités de paiement",               "required": True,  "type": "text"},
            {"key": "penalites_retard",    "label": "Pénalités de retard (FG/jour)",        "required": False, "type": "number"},
            {"key": "garantie_decennale",  "label": "Garantie décennale (oui/non)",         "required": False, "type": "select", "options": ["Oui", "Non"]},
        ],
    },
    # ── COMMERCIAL & AFFAIRES ────────────────────────────────────────────────
    {
        "id": "vente",
        "label": "Contrat de vente",
        "description": "Vente de bien meuble ou immeuble conforme au Code civil",
        "icon": "shopping-bag",
        "category": "Commercial & Affaires",
        "domain": "Droit civil",
        "fields": [
            {"key": "vendeur_nom",          "label": "Nom du vendeur",                 "required": True,  "type": "text"},
            {"key": "vendeur_adresse",      "label": "Adresse du vendeur",             "required": True,  "type": "text"},
            {"key": "acheteur_nom",         "label": "Nom de l'acheteur",              "required": True,  "type": "text"},
            {"key": "acheteur_adresse",     "label": "Adresse de l'acheteur",          "required": True,  "type": "text"},
            {"key": "bien_description",     "label": "Description détaillée du bien",  "required": True,  "type": "textarea"},
            {"key": "prix_vente",           "label": "Prix de vente (FG)",             "required": True,  "type": "number"},
            {"key": "modalites_paiement",   "label": "Modalités de paiement",          "required": True,  "type": "text"},
            {"key": "date_transfert",       "label": "Date de transfert de propriété", "required": True,  "type": "date"},
            {"key": "garanties",            "label": "Garanties accordées",            "required": False, "type": "text"},
        ],
    },
    {
        "id": "prestation",
        "label": "Prestation de service",
        "description": "Contrat de mission / consulting conforme au droit guinéen",
        "icon": "tool",
        "category": "Commercial & Affaires",
        "domain": "Economie",
        "fields": [
            {"key": "prestataire_nom",        "label": "Nom du prestataire",           "required": True,  "type": "text"},
            {"key": "prestataire_adresse",    "label": "Adresse du prestataire",       "required": True,  "type": "text"},
            {"key": "prestataire_rccm",       "label": "RCCM du prestataire",          "required": False, "type": "text"},
            {"key": "client_nom",             "label": "Nom du client",                "required": True,  "type": "text"},
            {"key": "client_adresse",         "label": "Adresse du client",            "required": True,  "type": "text"},
            {"key": "prestation_description", "label": "Description de la prestation", "required": True,  "type": "textarea"},
            {"key": "livrables",              "label": "Livrables attendus",           "required": False, "type": "textarea"},
            {"key": "duree",                  "label": "Durée de la mission",          "required": True,  "type": "text"},
            {"key": "montant",                "label": "Montant total HT (FG)",        "required": True,  "type": "number"},
            {"key": "modalites_paiement",     "label": "Modalités de paiement",       "required": True,  "type": "text"},
            {"key": "clause_exclusivite",     "label": "Clause d'exclusivité (oui/non)","required": False,"type": "select","options":["Non","Oui"]},
        ],
    },
    {
        "id": "franchise",
        "label": "Contrat de franchise",
        "description": "Franchise commerciale incluant DIP et obligations du franchisé",
        "icon": "store",
        "category": "Commercial & Affaires",
        "domain": "Droit commercial",
        "fields": [
            {"key": "franchiseur_nom",       "label": "Nom du franchiseur",              "required": True,  "type": "text"},
            {"key": "franchiseur_adresse",   "label": "Adresse du franchiseur",          "required": True,  "type": "text"},
            {"key": "franchiseur_rccm",      "label": "RCCM du franchiseur",             "required": False, "type": "text"},
            {"key": "franchise_nom",         "label": "Nom / Raison sociale du franchisé","required": True, "type": "text"},
            {"key": "franchise_adresse",     "label": "Adresse du franchisé",            "required": True,  "type": "text"},
            {"key": "enseigne",              "label": "Enseigne / Marque de la franchise","required": True, "type": "text"},
            {"key": "zone_exclusivite",      "label": "Zone géographique d'exclusivité", "required": True,  "type": "text"},
            {"key": "droit_entree",          "label": "Droit d'entrée (FG)",             "required": True,  "type": "number"},
            {"key": "redevance",             "label": "Redevance mensuelle (%CA)",       "required": True,  "type": "text"},
            {"key": "duree_contrat",         "label": "Durée du contrat",               "required": True,  "type": "text"},
            {"key": "formation_initiale",    "label": "Formation initiale prévue",       "required": False, "type": "text"},
        ],
    },
    {
        "id": "transport",
        "label": "Contrat de transport",
        "description": "Transport de marchandises ou de personnes conforme au Code commerce",
        "icon": "truck",
        "category": "Commercial & Affaires",
        "domain": "Droit commercial",
        "fields": [
            {"key": "expediteur_nom",      "label": "Nom de l'expéditeur / donneur d'ordre","required": True,"type": "text"},
            {"key": "expediteur_adresse",  "label": "Adresse de l'expéditeur",             "required": True, "type": "text"},
            {"key": "transporteur_nom",    "label": "Nom du transporteur",                "required": True, "type": "text"},
            {"key": "transporteur_adresse","label": "Adresse du transporteur",            "required": True, "type": "text"},
            {"key": "transporteur_rccm",   "label": "RCCM du transporteur",               "required": False,"type": "text"},
            {"key": "description_marchandises","label":"Description des marchandises",    "required": True, "type": "textarea"},
            {"key": "lieu_chargement",     "label": "Lieu de chargement",                 "required": True, "type": "text"},
            {"key": "lieu_livraison",      "label": "Lieu de livraison",                  "required": True, "type": "text"},
            {"key": "date_chargement",     "label": "Date de chargement",                 "required": True, "type": "date"},
            {"key": "prix_transport",      "label": "Prix du transport (FG)",             "required": True, "type": "number"},
            {"key": "assurance",           "label": "Assurance marchandises",             "required": False,"type": "text"},
        ],
    },
    # ── SOCIÉTAIRE & ASSOCIATIF ──────────────────────────────────────────────
    {
        "id": "societe",
        "label": "Statuts de société (SARL/SA)",
        "description": "Constitution d'une société commerciale conforme à l'OHADA",
        "icon": "building",
        "category": "Sociétaire & Associatif",
        "domain": "Droit des affaires",
        "fields": [
            {"key": "denomination",       "label": "Dénomination sociale",              "required": True,  "type": "text"},
            {"key": "forme_juridique",    "label": "Forme juridique",                   "required": True,  "type": "select", "options": ["SARL", "SA", "SNC", "SCS", "GIE"]},
            {"key": "siege_social",       "label": "Siège social (adresse complète)",   "required": True,  "type": "text"},
            {"key": "objet_social",       "label": "Objet social (activités)",          "required": True,  "type": "textarea"},
            {"key": "capital_social",     "label": "Capital social (FG)",               "required": True,  "type": "number"},
            {"key": "duree_societe",      "label": "Durée de la société (ans)",         "required": True,  "type": "number"},
            {"key": "associes",           "label": "Associés (nom, apport, parts %)",   "required": True,  "type": "textarea"},
            {"key": "gerant_nom",         "label": "Gérant / DG (nom complet)",         "required": True,  "type": "text"},
            {"key": "gerant_adresse",     "label": "Adresse du gérant",                 "required": True,  "type": "text"},
            {"key": "exercice_social",    "label": "Clôture de l'exercice social",      "required": False, "type": "text"},
            {"key": "depot_capital",      "label": "Banque de dépôt du capital",        "required": False, "type": "text"},
        ],
    },
    {
        "id": "partenariat",
        "label": "Accord de partenariat",
        "description": "Convention de partenariat stratégique ou opérationnel",
        "icon": "handshake",
        "category": "Sociétaire & Associatif",
        "domain": "Droit des affaires",
        "fields": [
            {"key": "partenaire1_nom",      "label": "Partenaire 1 — Nom / Raison sociale","required": True,"type": "text"},
            {"key": "partenaire1_adresse",  "label": "Partenaire 1 — Adresse",            "required": True, "type": "text"},
            {"key": "partenaire2_nom",      "label": "Partenaire 2 — Nom / Raison sociale","required": True,"type": "text"},
            {"key": "partenaire2_adresse",  "label": "Partenaire 2 — Adresse",            "required": True, "type": "text"},
            {"key": "objet_partenariat",    "label": "Objet du partenariat",              "required": True, "type": "textarea"},
            {"key": "contributions",        "label": "Contributions de chaque partie",    "required": True, "type": "textarea"},
            {"key": "partage_benefices",    "label": "Modalités de partage des bénéfices","required": False,"type": "text"},
            {"key": "duree",                "label": "Durée du partenariat",              "required": True, "type": "text"},
            {"key": "clause_non_concurrence","label":"Clause de non-concurrence",         "required": False,"type": "text"},
        ],
    },
    {
        "id": "association",
        "label": "Statuts d'association",
        "description": "Création d'une association conforme à la loi guinéenne sur les associations",
        "icon": "users",
        "category": "Sociétaire & Associatif",
        "domain": "Droit associatif",
        "fields": [
            {"key": "nom_association",    "label": "Nom de l'association",              "required": True,  "type": "text"},
            {"key": "siege",              "label": "Siège social",                       "required": True,  "type": "text"},
            {"key": "objet",              "label": "Objet / But de l'association",       "required": True,  "type": "textarea"},
            {"key": "fondateurs",         "label": "Fondateurs (noms et adresses)",      "required": True,  "type": "textarea"},
            {"key": "bureau",             "label": "Membres du bureau (Président, SG, Trésorier)", "required": True, "type": "textarea"},
            {"key": "cotisation",         "label": "Montant de la cotisation annuelle (FG)", "required": False, "type": "number"},
            {"key": "duree",              "label": "Durée de l'association",             "required": False, "type": "text"},
        ],
    },
    # ── CIVIL & FAMILLE ──────────────────────────────────────────────────────
    {
        "id": "pret",
        "label": "Contrat de prêt",
        "description": "Prêt d'argent avec ou sans intérêts conforme au Code civil",
        "icon": "banknote",
        "category": "Civil & Famille",
        "domain": "Droit civil",
        "fields": [
            {"key": "preteur_nom",       "label": "Nom du prêteur",               "required": True,  "type": "text"},
            {"key": "preteur_adresse",   "label": "Adresse du prêteur",           "required": True,  "type": "text"},
            {"key": "preteur_cin",       "label": "N° CIN du prêteur",            "required": False, "type": "text"},
            {"key": "emprunteur_nom",    "label": "Nom de l'emprunteur",          "required": True,  "type": "text"},
            {"key": "emprunteur_adresse","label": "Adresse de l'emprunteur",      "required": True,  "type": "text"},
            {"key": "emprunteur_cin",    "label": "N° CIN de l'emprunteur",       "required": False, "type": "text"},
            {"key": "montant",           "label": "Montant du prêt (FG)",         "required": True,  "type": "number"},
            {"key": "taux_interet",      "label": "Taux d'intérêt annuel (%)",    "required": False, "type": "number"},
            {"key": "duree_remboursement","label":"Durée de remboursement",       "required": True,  "type": "text"},
            {"key": "modalites",         "label": "Modalités de remboursement",   "required": True,  "type": "text"},
            {"key": "garantie",          "label": "Garantie / Caution",           "required": False, "type": "text"},
            {"key": "date_versement",    "label": "Date de versement du prêt",    "required": True,  "type": "date"},
        ],
    },
    {
        "id": "reconnaissance_dette",
        "label": "Reconnaissance de dette",
        "description": "Acte de reconnaissance de dette ou d'obligation de payer",
        "icon": "file-text",
        "category": "Civil & Famille",
        "domain": "Droit civil",
        "fields": [
            {"key": "debiteur_nom",      "label": "Nom du débiteur",              "required": True,  "type": "text"},
            {"key": "debiteur_adresse",  "label": "Adresse du débiteur",          "required": True,  "type": "text"},
            {"key": "debiteur_cin",      "label": "N° CIN du débiteur",           "required": False, "type": "text"},
            {"key": "creancier_nom",     "label": "Nom du créancier",             "required": True,  "type": "text"},
            {"key": "creancier_adresse", "label": "Adresse du créancier",         "required": True,  "type": "text"},
            {"key": "montant_du",        "label": "Montant dû (FG)",              "required": True,  "type": "number"},
            {"key": "origine_dette",     "label": "Origine / Cause de la dette",  "required": True,  "type": "textarea"},
            {"key": "date_echeance",     "label": "Date d'échéance du paiement",  "required": True,  "type": "date"},
            {"key": "taux_interet",      "label": "Intérêts de retard (%/an)",    "required": False, "type": "number"},
        ],
    },
    {
        "id": "donation",
        "label": "Acte de donation",
        "description": "Donation entre vifs conforme au Code civil guinéen",
        "icon": "gift",
        "category": "Civil & Famille",
        "domain": "Droit civil",
        "fields": [
            {"key": "donateur_nom",      "label": "Nom du donateur",              "required": True,  "type": "text"},
            {"key": "donateur_adresse",  "label": "Adresse du donateur",          "required": True,  "type": "text"},
            {"key": "donateur_cin",      "label": "N° CIN du donateur",           "required": False, "type": "text"},
            {"key": "donataire_nom",     "label": "Nom du donataire",             "required": True,  "type": "text"},
            {"key": "donataire_adresse", "label": "Adresse du donataire",         "required": True,  "type": "text"},
            {"key": "donataire_cin",     "label": "N° CIN du donataire",          "required": False, "type": "text"},
            {"key": "lien_parente",      "label": "Lien de parenté (si applicable)","required": False,"type": "text"},
            {"key": "bien_donne",        "label": "Description du bien donné",    "required": True,  "type": "textarea"},
            {"key": "valeur_estimee",    "label": "Valeur estimée (FG)",          "required": False, "type": "number"},
            {"key": "charges",           "label": "Charges / Conditions imposées","required": False, "type": "text"},
        ],
    },
    {
        "id": "mandat",
        "label": "Contrat de mandat",
        "description": "Mandat général ou spécial (pouvoir de représentation)",
        "icon": "user-check",
        "category": "Civil & Famille",
        "domain": "Droit civil",
        "fields": [
            {"key": "mandant_nom",        "label": "Nom du mandant (donneur de pouvoir)","required": True,"type": "text"},
            {"key": "mandant_adresse",    "label": "Adresse du mandant",              "required": True, "type": "text"},
            {"key": "mandant_cin",        "label": "N° CIN du mandant",               "required": False,"type": "text"},
            {"key": "mandataire_nom",     "label": "Nom du mandataire",               "required": True, "type": "text"},
            {"key": "mandataire_adresse", "label": "Adresse du mandataire",           "required": True, "type": "text"},
            {"key": "mandataire_cin",     "label": "N° CIN du mandataire",            "required": False,"type": "text"},
            {"key": "objet_mandat",       "label": "Objet précis du mandat",          "required": True, "type": "textarea"},
            {"key": "pouvoirs",           "label": "Pouvoirs accordés",               "required": True, "type": "textarea"},
            {"key": "duree",              "label": "Durée du mandat",                 "required": False,"type": "text"},
            {"key": "remuneration",       "label": "Rémunération du mandataire",      "required": False,"type": "text"},
        ],
    },
    {
        "id": "cession_creance",
        "label": "Cession de créance",
        "description": "Transfert d'une créance à un tiers conforme au Code civil",
        "icon": "arrow-right-circle",
        "category": "Civil & Famille",
        "domain": "Droit civil",
        "fields": [
            {"key": "cedant_nom",         "label": "Nom du cédant (créancier initial)", "required": True,"type": "text"},
            {"key": "cedant_adresse",     "label": "Adresse du cédant",                "required": True, "type": "text"},
            {"key": "cessionnaire_nom",   "label": "Nom du cessionnaire",              "required": True, "type": "text"},
            {"key": "cessionnaire_adresse","label":"Adresse du cessionnaire",          "required": True, "type": "text"},
            {"key": "debiteur_cede_nom",  "label": "Nom du débiteur cédé",            "required": True, "type": "text"},
            {"key": "description_creance","label": "Description de la créance",        "required": True, "type": "textarea"},
            {"key": "montant_creance",    "label": "Montant de la créance (FG)",       "required": True, "type": "number"},
            {"key": "prix_cession",       "label": "Prix de cession (FG)",             "required": True, "type": "number"},
            {"key": "date_cession",       "label": "Date de la cession",               "required": True, "type": "date"},
        ],
    },
    # ── PROTECTION & CONFIDENTIALITÉ ─────────────────────────────────────────
    {
        "id": "confidentialite",
        "label": "Accord de confidentialité (NDA)",
        "description": "Non-disclosure agreement pour protéger informations sensibles",
        "icon": "lock",
        "category": "Protection & Confidentialité",
        "domain": "Droit des affaires",
        "fields": [
            {"key": "partie1_nom",          "label": "Partie 1 — Nom / Société",          "required": True, "type": "text"},
            {"key": "partie1_adresse",      "label": "Partie 1 — Adresse",               "required": True, "type": "text"},
            {"key": "partie2_nom",          "label": "Partie 2 — Nom / Société",          "required": True, "type": "text"},
            {"key": "partie2_adresse",      "label": "Partie 2 — Adresse",               "required": True, "type": "text"},
            {"key": "objet_confidentialite","label": "Informations confidentielles concernées","required": True,"type": "textarea"},
            {"key": "duree_confidentialite","label": "Durée de la confidentialité",       "required": True, "type": "text"},
            {"key": "type_nda",             "label": "Type",                              "required": True, "type": "select","options":["Unilatéral","Bilatéral","Multilatéral"]},
            {"key": "exceptions",           "label": "Exceptions à la confidentialité",   "required": False,"type": "textarea"},
            {"key": "penalites",            "label": "Pénalités en cas de violation",     "required": False,"type": "text"},
        ],
    },
]


# ── Prompts LLM ───────────────────────────────────────────────────────────────
GENERATION_SYSTEM = """Tu es JusticIA, un juriste expert en droit guinéen et en rédaction de documents juridiques formels.

Tes documents sont :
- Complets, clairs et sans ambiguïté
- Conformes au droit positif guinéen (Codes civil, commercial, du travail, foncier, OHADA, etc.)
- Structurés avec des articles numérotés et des sections bien délimitées
- Rédigés en français juridique formel

Chaque article ou clause DOIT citer entre crochets la référence légale guinéenne applicable : [Art. X — Loi / Code guinéen].
Format de sortie : texte structuré avec sections en majuscules soulignées ou Markdown ##."""

ANALYSIS_SYSTEM = """Tu es JusticIA, un expert en audit de conformité juridique guinéen.
Tu analyses des contrats et fournis un rapport d'audit détaillé.
Tu réponds UNIQUEMENT en JSON valide selon le schéma demandé. Ne génère rien d'autre que le JSON.
Sois précis, professionnel et constructif dans tes recommandations."""


def _build_generation_prompt(contract_type: str, form_data: dict, rag_articles: list[dict], user_directives: str = "") -> str:
    label = CONTRACT_LABELS.get(contract_type, contract_type)
    articles_text = "\n".join(
        f"- Art. {a.get('numero', '?')} ({a.get('nom_doc', '')}) : {a.get('texte', '')[:400]}"
        for a in rag_articles[:15]
    ) or "Aucun article RAG disponible — rédiger selon les principes généraux du droit guinéen."
    form_text = "\n".join(f"  • {k.replace('_', ' ').title()} : {v}" for k, v in form_data.items() if v)

    directives_block = ""
    if user_directives.strip():
        directives_block = f"""
═══════════════════════════════════════
DIRECTIVES SPÉCIFIQUES DU CLIENT
═══════════════════════════════════════
{user_directives.strip()}

"""

    return f"""Rédige un {label} complet, formel et parfaitement conforme au droit positif guinéen.{directives_block}

═══════════════════════════════════════
INFORMATIONS FOURNIES PAR LE CLIENT
═══════════════════════════════════════
{form_text}

═══════════════════════════════════════
ARTICLES DE LOI GUINÉENS APPLICABLES
═══════════════════════════════════════
{articles_text}

═══════════════════════════════════════
INSTRUCTIONS DE RÉDACTION
═══════════════════════════════════════
1. STRUCTURE OBLIGATOIRE (dans l'ordre) :
   - En-tête : RÉPUBLIQUE DE GUINÉE / Ville, date / Titre du contrat en MAJUSCULES GRAS
   - ENTRE LES SOUSSIGNÉS (identification complète des parties)
   - PRÉAMBULE (contexte et objectif)
   - Article 1 — OBJET DU CONTRAT
   - Article 2 — DURÉE
   - Article 3 — CONDITIONS FINANCIÈRES / PRIX
   - Articles suivants adaptés au type de contrat (obligations, droits, modalités spécifiques)
   - Article N-2 — RÉSILIATION ET SANCTIONS
   - Article N-1 — RÈGLEMENT DES LITIGES (tribunal compétent guinéen, arbitrage OHADA si applicable)
   - Article N — DISPOSITIONS GÉNÉRALES (intégralité, nullité partielle, loi applicable)
   - SIGNATURES des parties avec date et lieu

2. Chaque article DOIT citer entre crochets la référence légale : *[Réf. Art. XX — Nom exact de la loi guinéenne]*
3. Les clauses contraires à la loi guinéenne sont réputées nulles de plein droit
4. Utiliser un français juridique formel, précis et sans ambiguïté
5. Numéroter les articles (Article 1, Article 2, etc.)
6. Ajouter des sous-articles (1.1, 1.2) pour les points complexes
7. Minimum 1500 mots pour un contrat complet
8. Pour le règlement des litiges : mentionner la compétence des tribunaux guinéens (Tribunal de commerce de Conakry ou tribunal civil selon le type)"""


def _build_analysis_prompt(contract_text: str, contract_type: str, rag_articles: list[dict]) -> str:
    label = CONTRACT_LABELS.get(contract_type, contract_type)
    articles_text = "\n".join(
        f"- Art. {a.get('numero', '?')} ({a.get('nom_doc', '')}) : {a.get('texte', '')[:400]}"
        for a in rag_articles[:15]
    ) or "Analyser selon les principes généraux du droit guinéen."

    return f"""Effectue un audit complet de ce {label} selon le droit positif guinéen.

═══════════════════════════════════════
CONTRAT À ANALYSER
═══════════════════════════════════════
{contract_text[:12000]}

═══════════════════════════════════════
ARTICLES DE LOI GUINÉENS APPLICABLES
═══════════════════════════════════════
{articles_text}

═══════════════════════════════════════
FORMAT DE RÉPONSE JSON OBLIGATOIRE
═══════════════════════════════════════
Réponds UNIQUEMENT avec ce JSON (sans markdown, sans ```json) :
{{
  "detected_type": "type de contrat détecté (en français)",
  "conformity_score": 75,
  "issues": [
    {{
      "severity": "critique|majeur|mineur",
      "clause": "Titre ou extrait exact de la clause problématique",
      "article_viole": "Article de loi guinéen potentiellement violé",
      "description": "Explication détaillée du problème",
      "suggestion": "Formulation corrigée recommandée ou action à prendre"
    }}
  ],
  "missing_clauses": [
    "Clause obligatoire manquante 1",
    "Clause obligatoire manquante 2"
  ],
  "strong_points": [
    "Point fort du contrat 1",
    "Point fort du contrat 2"
  ],
  "suggestions": [
    "Recommandation générale d'amélioration 1",
    "Recommandation générale d'amélioration 2"
  ],
  "risk_level": "faible|moyen|élevé",
  "verdict": "Résumé en 2-3 phrases du résultat de l'audit et des actions prioritaires"
}}

IMPORTANT :
- conformity_score : note de 0 à 100 (100 = contrat parfaitement conforme)
- severity "critique" = clause illégale ou nulle selon la loi guinéenne
- severity "majeur" = problème sérieux pouvant entraîner des litiges
- severity "mineur" = amélioration recommandée mais non bloquante
- Identifie AU MOINS les clauses obligatoires manquantes
- Sois constructif et précis"""


# ── LLM helpers (via service centralisé) ─────────────────────────────────────

def _generate_contract_sync(contract_type: str, form_data: dict, rag_articles: list[dict], user_directives: str = "") -> str:
    """Génère un contrat via le service LLM centralisé."""
    prompt = _build_generation_prompt(contract_type, form_data, rag_articles, user_directives)
    return llm.call(GENERATION_SYSTEM, prompt, max_tokens=8000, temperature=0.2)


def _analyze_contract_sync(contract_text: str, contract_type: str, rag_articles: list[dict]) -> dict:
    """Analyse un contrat via le service LLM centralisé et retourne du JSON."""
    prompt = _build_analysis_prompt(contract_text, contract_type, rag_articles)
    raw = llm.call(ANALYSIS_SYSTEM, prompt, json_mode=True, max_tokens=4000, temperature=0.1)
    raw = raw.strip()
    raw = re.sub(r"^```json\s*", "", raw)
    raw = re.sub(r"\s*```$", "", raw)
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {
            "detected_type": contract_type,
            "conformity_score": 50,
            "issues": [],
            "missing_clauses": [],
            "strong_points": [],
            "suggestions": [raw[:500]],
            "risk_level": "moyen",
            "verdict": "Analyse incomplète — veuillez réessayer.",
        }


def _extract_pdf_sync(file_bytes: bytes) -> str:
    """Extrait le texte d'un PDF (synchrone)."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(file_bytes))
        pages = []
        for page in reader.pages:
            try:
                text = page.extract_text() or ""
                pages.append(text.strip())
            except Exception:
                pages.append("")
        return "\n\n".join(p for p in pages if p).strip()
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Impossible d'extraire le texte : {e}")


# ── Helpers DB ─────────────────────────────────────────────────────────────────

def _doc_out(doc: GeneratedDocument) -> DocumentArchiveOut:
    return DocumentArchiveOut(
        id=str(doc.id),
        title=doc.title,
        mode=doc.mode,
        contract_type=doc.contract_type,
        created_at=doc.created_at,
    )


def _doc_detail(doc: GeneratedDocument) -> DocumentArchiveDetail:
    return DocumentArchiveDetail(
        id=str(doc.id),
        title=doc.title,
        mode=doc.mode,
        contract_type=doc.contract_type,
        created_at=doc.created_at,
        content=doc.content,
        analysis=doc.analysis,
        sources=doc.sources,
        form_data=doc.form_data,
    )


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/templates")
async def get_templates():
    """Retourne tous les templates de contrats avec leurs champs formulaire."""
    return TEMPLATES


@router.post("/generate", response_model=GenerateResponse, status_code=201)
async def generate_contract(
    body:         GenerateRequest,
    current_user: CurrentUser,
    db:           DB,
):
    """Génère un contrat juridique complet via RAG + LLM."""
    if body.contract_type not in CONTRACT_DOMAIN_MAP:
        raise HTTPException(
            status_code=400,
            detail=f"Type de contrat inconnu. Valeurs acceptées : {list(CONTRACT_DOMAIN_MAP.keys())}",
        )

    domain = CONTRACT_DOMAIN_MAP[body.contract_type]
    label  = CONTRACT_LABELS[body.contract_type]

    # Résumé des infos formulaire pour la query RAG
    form_summary = ", ".join(f"{k}: {v}" for k, v in body.form_data.items() if v)
    rag_query = f"Rédiger un {label} en droit guinéen : {form_summary}"

    try:
        _, rag_articles = await ask_rag(
            rag_query,
            agent_id="jurisprudence",
            top_k=15,
            custom_domains=[domain] if domain else None,
        )
    except Exception:
        rag_articles = []

    sources = format_sources(rag_articles)

    loop    = asyncio.get_event_loop()
    content = await loop.run_in_executor(
        _executor,
        _generate_contract_sync,
        body.contract_type,
        body.form_data,
        rag_articles,
        body.user_directives,
    )

    # Titre automatique intelligible
    parties = (
        body.form_data.get("employe_nom")
        or body.form_data.get("employe_prenom")
        or body.form_data.get("locataire_nom")
        or body.form_data.get("acheteur_nom")
        or body.form_data.get("client_nom")
        or body.form_data.get("emprunteur_nom")
        or body.form_data.get("debiteur_nom")
        or body.form_data.get("denomination")
        or body.form_data.get("franchise_nom")
        or body.form_data.get("donataire_nom")
        or body.form_data.get("partenaire2_nom")
        or "Document"
    )
    title = f"{label} — {parties}"

    doc = GeneratedDocument(
        user_id=current_user.id,
        mode="generated",
        contract_type=body.contract_type,
        title=title,
        content=content,
        sources=json.dumps(sources, ensure_ascii=False),
        form_data=json.dumps(body.form_data, ensure_ascii=False),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    return GenerateResponse(
        id=str(doc.id),
        title=doc.title,
        content=doc.content,
        sources=sources,
        created_at=doc.created_at,
    )


@router.post("/analyze", response_model=AnalyzeResponse, status_code=201)
async def analyze_contract(
    current_user:  CurrentUser,
    db:            DB,
    file:          UploadFile = File(...),
    contract_type: str        = Form("auto"),
):
    """Analyse un contrat PDF uploadé et retourne un audit de conformité complet."""
    if file.content_type not in ALLOWED_MIME and not (file.filename or "").endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Seuls les fichiers PDF sont acceptés.")

    file_bytes = await file.read()
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Le fichier est vide.")
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 25 Mo).")

    # Normaliser le type (auto → détecter via LLM)
    if contract_type not in CONTRACT_DOMAIN_MAP:
        contract_type = "vente"  # fallback avant détection

    domain = CONTRACT_DOMAIN_MAP[contract_type]
    label  = CONTRACT_LABELS[contract_type]

    loop = asyncio.get_event_loop()
    contract_text = await loop.run_in_executor(_executor, _extract_pdf_sync, file_bytes)

    if not contract_text or len(contract_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Impossible d'extraire du texte du PDF.")

    rag_query = f"Audit de conformité d'un {label} selon le droit guinéen : clauses obligatoires et interdites"
    try:
        _, rag_articles = await ask_rag(
            rag_query,
            agent_id="jurisprudence",
            top_k=15,
            custom_domains=[domain] if domain else None,
        )
    except Exception:
        rag_articles = []

    sources = format_sources(rag_articles)

    analysis_data = await loop.run_in_executor(
        _executor,
        _analyze_contract_sync,
        contract_text,
        contract_type,
        rag_articles,
    )

    # Si le LLM a détecté un type différent, mettre à jour
    detected = analysis_data.get("detected_type", label)
    title    = f"Audit — {file.filename or 'contrat.pdf'}"
    issues   = analysis_data.get("issues", [])
    risk_lvl = analysis_data.get("risk_level", "moyen")

    doc = GeneratedDocument(
        user_id=current_user.id,
        mode="analyzed",
        contract_type=contract_type,
        title=title,
        content=contract_text[:5000],
        analysis=json.dumps(analysis_data, ensure_ascii=False),
        sources=json.dumps(sources, ensure_ascii=False),
        form_data=json.dumps({"filename": file.filename or "contrat.pdf", "detected_type": detected}, ensure_ascii=False),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)

    from app.schemas.generation import AnalyzeIssue

    def _to_issue(i: dict) -> AnalyzeIssue:
        return AnalyzeIssue(
            severity=i.get("severity", "mineur"),
            clause=i.get("clause", ""),
            article_viole=i.get("article_viole", i.get("article", "")),
            article=i.get("article", i.get("article_viole", "")),
            description=i.get("description", ""),
            suggestion=i.get("suggestion", ""),
        )

    return AnalyzeResponse(
        id=str(doc.id),
        title=title,
        issues=[_to_issue(i) for i in issues if isinstance(i, dict)],
        suggestions=analysis_data.get("suggestions", []),
        missing_clauses=analysis_data.get("missing_clauses", []),
        strong_points=analysis_data.get("strong_points", []),
        conformity_score=int(analysis_data.get("conformity_score", 50)),
        risk_level=risk_lvl,
        verdict=analysis_data.get("verdict", ""),
        detected_type=analysis_data.get("detected_type", label),
        sources=sources,
        created_at=doc.created_at,
    )


@router.get("/archives", response_model=list[DocumentArchiveOut])
async def list_archives(
    current_user: CurrentUser,
    db:           DB,
    limit:        int = 50,
):
    """Liste tous les documents générés/analysés de l'utilisateur."""
    result = await db.execute(
        select(GeneratedDocument)
        .where(GeneratedDocument.user_id == current_user.id)
        .order_by(GeneratedDocument.created_at.desc())
        .limit(limit)
    )
    return [_doc_out(d) for d in result.scalars()]


@router.get("/archives/{doc_id}", response_model=DocumentArchiveDetail)
async def get_archive(
    doc_id:       str,
    current_user: CurrentUser,
    db:           DB,
):
    """Retourne le détail complet d'un document."""
    try:
        did = _uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalide")

    result = await db.execute(
        select(GeneratedDocument).where(
            GeneratedDocument.id == did,
            GeneratedDocument.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")
    return _doc_detail(doc)


@router.delete("/archives/{doc_id}", status_code=204)
async def delete_archive(
    doc_id:       str,
    current_user: CurrentUser,
    db:           DB,
):
    """Supprime un document."""
    try:
        did = _uuid.UUID(doc_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalide")

    result = await db.execute(
        select(GeneratedDocument).where(
            GeneratedDocument.id == did,
            GeneratedDocument.user_id == current_user.id,
        )
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document introuvable")

    await db.delete(doc)
    await db.commit()

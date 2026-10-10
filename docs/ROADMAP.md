# JusticIA — Feuille de route & Recommandations produit

> **Vision** : Devenir le système d'information juridique de référence en Guinée et en Afrique de l'Ouest francophone, en mettant l'intelligence artificielle au service de la justice, de l'équité et de l'accès au droit pour tous.

---

## Table des matières

1. [Contexte et état actuel](#1-contexte-et-état-actuel)
2. [Principes directeurs](#2-principes-directeurs)
3. [Plan par offre](#3-plan-par-offre)
   - [Gratuit](#31-gratuit--accès-citoyen)
   - [Premium](#32-premium--professionnel-individuel)
   - [Entreprise / Cabinet](#33-entreprise--cabinet-juridique)
   - [Gouvernement / Institution](#34-gouvernement--institution-publique)
4. [Fonctionnalités transversales prioritaires](#4-fonctionnalités-transversales-prioritaires)
5. [Intelligence Artificielle avancée](#5-intelligence-artificielle-avancée)
6. [Sécurité et conformité](#6-sécurité-et-conformité)
7. [Infrastructure et scalabilité](#7-infrastructure-et-scalabilité)
8. [Roadmap trimestrielle suggérée](#8-roadmap-trimestrielle-suggérée)

---

## 1. Contexte et état actuel

### Ce qui existe déjà
| Module | Status |
|---|---|
| Authentification JWT + Google OAuth | ✅ En production |
| Chat IA avec agents juridiques (RAG) | ✅ En production |
| Agents personnalisés | ✅ En production |
| Gestion des procès (Pièces + Déclarations + IA) | ✅ En production |
| Abonnements dynamiques (admin-driven) | ✅ En production |
| Mode éphémère (sans historique) | ✅ En production |
| Limite quotidienne par plan | ✅ En production |
| Administration (stats, users, plans) | ✅ En production |

### Ce qui manque pour être compétitif
L'application dispose d'une base solide. Les recommandations ci-dessous constituent la deuxième vague de développement pour atteindre un niveau professionnel, institutionnel et gouvernemental.

---

## 2. Principes directeurs

- **Accès au droit pour tous** — le plan gratuit doit rester utilisable et utile pour le citoyen ordinaire.
- **Confidentialité maximale** — les données juridiques sont sensibles. Chiffrement bout en bout pour les plans élevés.
- **IA explicable** — chaque réponse IA doit citer ses sources (article de loi, jurisprudence, document de procès).
- **Multilinguisme** — Français, Pular, Malinké, Soussou à terme.
- **Accessibilité** — utilisable sur mobile en zone à faible connectivité.

---

## 3. Plan par offre

---

### 3.1 Gratuit — Accès citoyen

**Cible** : Citoyen ordinaire, étudiant en droit, justiciable.

**Objectif** : Permettre à tout Guinéen d'accéder à une information juridique de base.

#### Fonctionnalités recommandées
- [ ] **Encyclopédie juridique publique** — moteur de recherche en langage naturel dans les textes de loi guinéens (sans IA, juste recherche full-text).
- [ ] **Glossaire juridique simplifié** — explication des termes en français courant et en langues locales.
- [ ] **Guide des démarches administratives** — "Comment porter plainte ?", "Comment demander un extrait de casier judiciaire ?", etc.
- [ ] **Annuaire des juridictions** — tribunaux, cours d'appel, cours suprême avec adresses, horaires, compétences.
- [ ] **Formulaires téléchargeables** — modèles de lettres, de requêtes simples.
- [ ] **5 questions IA / jour** (déjà implémenté).
- [ ] **1 procès actif** avec 5 documents max.

---

### 3.2 Premium — Professionnel individuel

**Cible** : Avocat indépendant, notaire, huissier, magistrat, consultant juridique.

**Objectif** : Être l'assistant juridique personnel du praticien du droit.

#### Fonctionnalités recommandées

##### Assistant IA avancé
- [ ] **Questions illimitées** avec contexte de session étendu (mémoire longue).
- [ ] **Citations automatiques** — chaque réponse IA indique l'article exact, la loi, la jurisprudence utilisée.
- [ ] **Mode comparaison de textes** — comparer deux versions d'un contrat ou d'une loi et identifier les différences.
- [ ] **Résumé automatique de document** — upload d'un PDF → résumé structuré en 1 clic.
- [ ] **Génération de documents** — brouillons de requêtes, conclusions, mémoires, contrats simples à partir d'un prompt.
- [ ] **Traduction juridique** — Français ↔ Anglais pour les documents internationaux.

##### Gestion des affaires
- [ ] **Procès illimités** avec dossiers illimités.
- [ ] **Chronologie automatique** — à partir des dates dans les déclarations et documents, générer une frise chronologique de l'affaire.
- [ ] **Carte mentale du procès** — visualisation des parties, liens, faits clés.
- [ ] **Rappels et échéances** — alertes pour les dates d'audience, délais de prescription, délais de recours.
- [ ] **Export du dossier** — export PDF complet du procès (documents + déclarations + résumé IA).
- [ ] **Signature électronique simple** — signer les documents générés.

##### Productivité
- [ ] **Historique illimité** des conversations IA.
- [ ] **Favoris et annotations** — surligner et annoter des passages dans les documents uploadés.
- [ ] **Recherche globale** — rechercher dans tous ses dossiers, déclarations et conversations.
- [ ] **Tableau de bord personnel** — statistiques d'utilisation, affaires en cours, prochaines échéances.

---

### 3.3 Entreprise / Cabinet juridique

**Cible** : Cabinet d'avocats, étude notariale, société d'huissiers, bureau de conseil juridique.

**Objectif** : Être la plateforme de gestion collaborative du cabinet.

#### Fonctionnalités recommandées

##### Gestion multi-utilisateurs
- [ ] **Espace cabinet** — un compte maître + N collaborateurs (avocats associés, stagiaires, secrétaires).
- [ ] **Rôles et permissions** — Associé (accès total), Collaborateur (accès dossiers assignés), Stagiaire (lecture seule), Secrétaire (admin, pas d'IA).
- [ ] **Affectation de dossiers** — assigner un procès à un ou plusieurs collaborateurs.
- [ ] **Suivi d'activité** — qui a consulté quoi, qui a modifié quoi, journal d'audit interne.

##### Collaboration
- [ ] **Annotations collaboratives** — plusieurs utilisateurs peuvent annoter le même document.
- [ ] **Commentaires internes** — fil de discussion interne sur un dossier (distinct du chat IA).
- [ ] **Notifications en temps réel** — WebSocket : "Me Diallo a ajouté une déclaration dans l'affaire Konate".
- [ ] **Co-rédaction de documents** — plusieurs utilisateurs travaillent simultanément sur un mémoire.
- [ ] **Revue et validation** — soumettre un document à un associé pour validation avant envoi.

##### Gestion commerciale du cabinet
- [ ] **Gestion des clients** (CRM juridique) — fiche client, historique des affaires, coordonnées.
- [ ] **Suivi du temps** — horodater le travail par dossier pour la facturation.
- [ ] **Facturation** — générer des factures d'honoraires basées sur le temps passé.
- [ ] **Agenda partagé** — calendrier des audiences, réunions, délais pour toute l'équipe.

##### IA cabinet
- [ ] **Agents IA partagés** — les agents personnalisés créés par un associé sont disponibles pour tout le cabinet.
- [ ] **Base de jurisprudence interne** — le cabinet peut uploader ses propres décisions de référence.
- [ ] **Modèles de documents du cabinet** — bibliothèque de templates validés (contrats types, clauses standard).
- [ ] **Analyse de cohérence** — l'IA vérifie la cohérence entre les documents d'un même dossier.

##### Administration
- [ ] **Tableau de bord cabinet** — affaires ouvertes/fermées, charge par collaborateur, revenus.
- [ ] **Archivage réglementaire** — archivage à valeur probante des dossiers clôturés (10 ans).
- [ ] **Backup et export** — export complet des données du cabinet (portabilité).

---

### 3.4 Gouvernement / Institution publique

**Cible** : Tribunaux, Ministère de la Justice, Assemblée Nationale, Cour Suprême, institutions de formation (École Nationale de Droit).

**Objectif** : Moderniser le système judiciaire guinéen, améliorer la traçabilité et réduire la corruption.

#### Fonctionnalités recommandées

##### Gestion judiciaire numérique
- [ ] **Registre numérique des affaires** — numérotation automatique, suivi du statut (en instruction, jugé, en appel, clôturé).
- [ ] **Calendrier d'audience public** — les citoyens peuvent consulter les dates d'audience les concernant.
- [ ] **Notification aux parties** — SMS/email automatique aux parties lors d'une convocation ou d'une décision.
- [ ] **Gestion des détenus** (module carcéral) — suivi des mandats de dépôt, durées de détention provisoire, alertes de dépassement légal.
- [ ] **Suivi des délais légaux** — alerte automatique si un délai de procédure est dépassé (prescriptions, délais d'instruction).

##### Numérisation des archives
- [ ] **Scanning et indexation de documents papier** — upload massif + OCR pour numériser les archives existantes.
- [ ] **Moteur de recherche dans les archives** — retrouver une décision par numéro, parties, date, infraction.
- [ ] **Jurisprudence nationale** — base de données des décisions de justice guinéennes, consultable et citée par l'IA.
- [ ] **Publication officielle** — publier les décisions de justice dans un journal officiel numérique.

##### Transparence et lutte contre la corruption
- [ ] **Traçabilité intégrale** — tout accès à un dossier judiciaire est loggé avec horodatage et identifiant de l'agent.
- [ ] **Alerte d'anomalie** — l'IA détecte les patterns suspects (un dossier modifié à 2h du matin, accès non autorisé).
- [ ] **Tableau de bord ministériel** — statistiques nationales : taux de résolution, durée moyenne des affaires, répartition géographique.
- [ ] **Rapport automatique** — génération mensuelle de rapports statistiques pour le ministère.

##### Formation et recherche
- [ ] **Plateforme e-learning juridique** — cours en ligne pour magistrats, avocats, greffiers (formation continue).
- [ ] **Simulateur de procédure** — entraînement interactif pour les étudiants en droit.
- [ ] **Bibliothèque de cas pratiques** — anonymisation et publication de cas réels à des fins pédagogiques.
- [ ] **Accès chercheurs** — API ouverte pour les universitaires (données anonymisées).

##### Interopérabilité
- [ ] **API officielle** — intégration avec d'autres systèmes gouvernementaux (état civil, casier judiciaire, police).
- [ ] **Identité numérique** — connexion via la carte nationale d'identité numérique (si disponible).
- [ ] **Partage inter-juridictions** — un dossier peut être transféré numériquement entre tribunaux.

---

## 4. Fonctionnalités transversales prioritaires

Ces fonctionnalités bénéficient à tous les plans et doivent être développées en priorité.

### 4.1 Application mobile native (PWA → App)
- [ ] Progressive Web App (PWA) en priorité — fonctionne hors ligne sur mobile.
- [ ] Synchronisation offline — travailler sans connexion, sync automatique au retour.
- [ ] Application Android native (marché guinéen = Android dominant).
- [ ] Dictée vocale — saisir des déclarations à la voix (très utile en audience).

### 4.2 Notifications intelligentes
- [ ] Email + SMS pour les alertes critiques (audiences, délais, partages).
- [ ] Notifications push (web + mobile).
- [ ] Digest hebdomadaire personnalisé — "Voici les textes de loi récemment ajoutés dans vos domaines".

### 4.3 Recherche universelle
- [ ] Recherche plein texte dans tous les dossiers, documents, déclarations, conversations.
- [ ] Filtres avancés : date, type, auteur, statut, domaine juridique.
- [ ] Recherche sémantique (IA) — "Trouve-moi des affaires similaires à celle-ci".

### 4.4 Tableaux de bord et analytics
- [ ] Chaque utilisateur a un tableau de bord personnalisé avec ses KPIs.
- [ ] Visualisations : graphiques d'activité, répartition par domaine, charge de travail.
- [ ] Export des données en Excel/CSV.

### 4.5 Multilinguisme
- [ ] Interface en Pular, Malinké, Soussou (les 3 principales langues de Guinée).
- [ ] Traduction automatique des déclarations en audience (parlées en langue locale → French).
- [ ] Glossaire multilingue des termes juridiques.

### 4.6 Accessibilité
- [ ] Mode contraste élevé pour les malvoyants.
- [ ] Compatible avec les lecteurs d'écran (WCAG 2.1 AA).
- [ ] Version allégée pour les connexions lentes (2G/3G).

---

## 5. Intelligence Artificielle avancée

### 5.1 Fonctionnalités IA à développer

| Fonctionnalité | Plan minimal | Impact |
|---|---|---|
| Citations de sources dans les réponses | Premium | ⭐⭐⭐⭐⭐ |
| Résumé automatique de document | Premium | ⭐⭐⭐⭐⭐ |
| Génération de documents juridiques | Premium | ⭐⭐⭐⭐⭐ |
| Détection d'incohérences dans un dossier | Cabinet | ⭐⭐⭐⭐ |
| Prédiction d'issue (probabilité de succès) | Cabinet | ⭐⭐⭐⭐ |
| Chronologie automatique des faits | Premium | ⭐⭐⭐⭐ |
| Recherche de jurisprudence similaire | Cabinet | ⭐⭐⭐⭐ |
| Analyse de contrat (risques, clauses abusives) | Premium | ⭐⭐⭐⭐ |
| Traduction juridique | Premium | ⭐⭐⭐ |
| OCR sur documents scannés | Cabinet | ⭐⭐⭐⭐ |
| Dictée vocale → déclaration textuelle | Tous | ⭐⭐⭐⭐⭐ |
| Alerte d'anomalie (IA gouvernement) | Gouvernement | ⭐⭐⭐⭐⭐ |

### 5.2 Amélioration du RAG actuel
- [ ] **Reranking** — ajouter un modèle de reranking (Cohere, BGE) pour améliorer la pertinence.
- [ ] **Chunking adaptatif** — découper les textes de loi par article plutôt que par taille fixe.
- [ ] **Metadata filtering** — filtrer par domaine, date de publication, juridiction avant la recherche vectorielle.
- [ ] **Streaming** — afficher la réponse IA mot par mot pour une meilleure expérience.
- [ ] **Feedback utilisateur** — boutons 👍/👎 sur chaque réponse pour améliorer le modèle.
- [x] ~~**Finetuning**~~ — abandonné (oct. 2026) : la fiabilité vient du RAG et de la vérification des citations, pas de l'entraînement. Voir OLLAMA_SETUP.md.

### 5.3 Modèles IA recommandés par usage
| Usage | Modèle recommandé | Raison |
|---|---|---|
| Chat juridique général | Claude 3.5 Sonnet / GPT-4o | Meilleure compréhension contextuelle |
| Génération de documents | Claude 3.5 Sonnet | Meilleur pour l'écriture longue |
| Résumé rapide | Claude 3 Haiku / GPT-4o-mini | Coût réduit, suffisant |
| Embeddings | `text-embedding-3-large` | Meilleure qualité vectorielle |
| OCR | Azure Document Intelligence | Spécialisé documents |
| Dictée vocale | Whisper (OpenAI) | Multilingue, parfait pour langues africaines |

---

## 6. Sécurité et conformité

### 6.1 Sécurité données
- [ ] **Chiffrement au repos** — données chiffrées en base (AES-256) pour les plans Cabinet et Gouvernement.
- [ ] **Chiffrement en transit** — HTTPS/TLS 1.3 partout (déjà actif).
- [ ] **Chiffrement bout en bout** — pour les messages du chat (plans Gouvernement).
- [ ] **Isolation des données** — chaque cabinet a sa propre partition logique, aucune fuite possible.
- [ ] **Purge automatique** — les données du mode éphémère sont purgées toutes les 24h (déjà partiellement en place).
- [ ] **Audit trail** — journal d'accès immuable pour les institutions.

### 6.2 Authentification renforcée
- [ ] **2FA obligatoire** pour les plans Cabinet et Gouvernement.
- [ ] **SSO SAML/OIDC** — connexion via le système d'identité du gouvernement guinéen.
- [ ] **Session management** — déconnexion automatique après inactivité, gestion des sessions multi-appareils.
- [ ] **IP whitelisting** — les institutions peuvent restreindre l'accès à leurs plages IP.

### 6.3 Conformité
- [ ] **RGPD-compatible** — même si le RGPD ne s'applique pas directement en Guinée, les bonnes pratiques doivent être suivies.
- [ ] **Droit à l'oubli** — suppression complète des données sur demande.
- [ ] **Politique de confidentialité** claire et accessible.
- [ ] **Conditions d'utilisation** adaptées aux professionnels du droit.
- [ ] **Hébergement local** — à terme, héberger les données gouvernementales sur des serveurs en Guinée ou en Afrique.

---

## 7. Infrastructure et scalabilité

### 7.1 Architecture cible
```
                    ┌─────────────────────────────────┐
                    │         CDN (Cloudflare)         │
                    └──────────────┬──────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
    ┌─────────▼──────┐   ┌────────▼───────┐  ┌────────▼───────┐
    │  Web Angular   │   │  API FastAPI   │  │  Admin Panel   │
    │   (Vercel)     │   │  (Railway/EC2) │  │                │
    └────────────────┘   └────────┬───────┘  └────────────────┘
                                  │
               ┌──────────────────┼──────────────────┐
               │                  │                  │
    ┌──────────▼──────┐  ┌───────▼───────┐  ┌───────▼──────┐
    │  PostgreSQL     │  │  ChromaDB /   │  │  Redis Cache │
    │  (Supabase)     │  │  Qdrant       │  │              │
    └─────────────────┘  └───────────────┘  └──────────────┘
```

### 7.2 Migrations techniques recommandées
- [ ] **Alembic** — mettre en place les migrations de base de données propres (remplacer les ALTER TABLE manuels).
- [ ] **Redis** — cache pour les sessions, rate limiting distribué, résultats RAG fréquents.
- [ ] **Celery / ARQ** — file de tâches asynchrones pour les longs traitements (OCR, génération de document).
- [ ] **WebSocket** — notifications temps réel (déjà partiellement structuré).
- [ ] **Qdrant** — migrer de ChromaDB vers Qdrant pour une meilleure scalabilité vectorielle.
- [ ] **S3 / MinIO** — stocker les fichiers PDF sur un object storage (remplacer le stockage fichier local).
- [ ] **CI/CD** — pipeline GitHub Actions pour tests + déploiement automatique.
- [ ] **Monitoring** — Sentry (erreurs), Prometheus + Grafana (métriques), DataDog ou Posthog (usage).

---

## 8. Roadmap trimestrielle suggérée

### Q2 2026 — Consolidation et premium
**Objectif : rendre l'offre Premium convaincante**

| Priorité | Fonctionnalité | Effort |
|---|---|---|
| 🔴 Critique | Streaming des réponses IA (mot à mot) | M |
| 🔴 Critique | Citations de sources dans les réponses IA | M |
| 🔴 Critique | Application mobile PWA offline | L |
| 🟠 Haute | Résumé automatique de document (1 clic) | S |
| 🟠 Haute | Export PDF complet d'un dossier | M |
| 🟠 Haute | Rappels / échéances (audiences, délais) | M |
| 🟡 Moyenne | Recherche globale dans les dossiers | M |
| 🟡 Moyenne | Dictée vocale pour les déclarations | M |
| 🟡 Moyenne | Alembic + migrations propres | S |

### Q3 2026 — Cabinet et collaboration
**Objectif : acquérir les premiers cabinets d'avocats**

| Priorité | Fonctionnalité | Effort |
|---|---|---|
| 🔴 Critique | Multi-utilisateurs par espace cabinet | XL |
| 🔴 Critique | Rôles et permissions | L |
| 🔴 Critique | Stockage fichiers S3/MinIO | M |
| 🟠 Haute | Notifications temps réel (WebSocket) | L |
| 🟠 Haute | Gestion des clients (CRM basique) | M |
| 🟠 Haute | Suivi du temps + facturation | L |
| 🟠 Haute | Annotations collaboratives | M |
| 🟡 Moyenne | Agenda partagé du cabinet | L |
| 🟡 Moyenne | OCR sur documents scannés | M |

### Q4 2026 — Gouvernement et institutionnel
**Objectif : signer un premier partenariat avec une institution publique**

| Priorité | Fonctionnalité | Effort |
|---|---|---|
| 🔴 Critique | Registre numérique des affaires | XL |
| 🔴 Critique | Traçabilité et audit trail | L |
| 🔴 Critique | 2FA obligatoire | S |
| 🟠 Haute | Calendrier d'audience public | M |
| 🟠 Haute | Jurisprudence nationale (base de données) | XL |
| 🟠 Haute | Tableau de bord ministériel | L |
| 🟡 Moyenne | Multilinguisme (Pular, Malinké) | XL |
| 🟡 Moyenne | SSO gouvernemental | L |

### Q1 2027 — IA avancée et scale
**Objectif : IA différenciante, expansion régionale**

| Priorité | Fonctionnalité | Effort |
|---|---|---|
| 🔴 Critique | Génération de documents juridiques | L |
| ~~🔴 Critique~~ | ~~Finetuning sur corpus juridique guinéen~~ (abandonné) | — |
| 🟠 Haute | Prédiction d'issue (probabilité de succès) | XL |
| 🟠 Haute | Analyse de contrat automatique | L |
| 🟠 Haute | Expansion Sénégal / Côte d'Ivoire | XL |
| 🟡 Moyenne | API publique pour chercheurs | M |

---

**Légende efforts** : S = < 1 semaine · M = 1-2 semaines · L = 2-4 semaines · XL = 1-2 mois

---

> *Document rédigé le 2 mars 2026 — À réviser chaque trimestre en fonction des retours utilisateurs et des priorités business.*

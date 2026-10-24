# Audit des fonctionnalités restantes — JusticIA

Dernière vérification : 24 octobre 2026

## Fonctionnalités opérationnelles

| Fonctionnalité | État | Remarque |
|---|---|---|
| Assistant juridique / RAG | Opérationnel | Corpus indexé, citations et garde-fous actifs. |
| Agents intégrés | Opérationnel | Sélection par domaine et conversation. |
| Agents personnalisés | Opérationnel | Création, modification, suppression et lancement corrigés. |
| Historique | Opérationnel | Consultation et suppression disponibles. |
| Dossiers | Opérationnel | CRUD, documents, notes et chat de dossier. |
| Recherche globale | Opérationnel | Consultations, dossiers, documents et notes. |
| Notifications | Opérationnel | Lecture, suppression et filtrage non lues. |
| Abonnement / Mosagix Pay | Intégré | Checkout, retour, webhook signé, activation et facture. Configuration Mosagix réelle encore nécessaire. |
| Facturation | Activé | `/dashboard/billing` utilise désormais le centre abonnement et les factures. |

## Fonctionnalités à construire

### 1. Cabinet et équipe — priorité haute

Il manque un modèle métier pour l’organisation : cabinet, membres, invitations, rôles et permissions. Il faut d’abord définir les règles avant de créer l’interface.

### 2. Clients — priorité haute

Il manque un modèle `Client` et ses relations avec les dossiers. L’écran devra permettre la création, la recherche, la fiche client et l’accès aux dossiers associés.

### 3. Annuaire — priorité moyenne

Il faut une source officielle vérifiée (tribunaux, juridictions, institutions et coordonnées). Aucune donnée ne doit être ajoutée manuellement sans source.

## Ordre recommandé

1. Définir le modèle Cabinet/Équipe et les permissions.
2. Ajouter les tables et API Clients.
3. Construire les écrans Cabinet et Clients.
4. Connecter Mosagix Pay en environnement réel et tester un paiement.
5. Importer l’annuaire depuis une source officielle.

Les écrans `firm`, `clients` et `directory` restent volontairement protégés par l’écran d’attente tant que leurs données métier ne sont pas définies. Cela évite de présenter des informations fictives.

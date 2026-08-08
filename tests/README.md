# Tests E2E — Mercer & Stellaria Corporation

Suite Playwright vérifiant les fonctionnalités du Lot 1 (dossiers, sous-dossiers, documents, clients, permissions).

## Exécution

```bash
# Assure-toi que le dev server tourne (http://localhost:8080)
bun run test:e2e            # headless
bun run test:e2e:ui         # interface graphique
```

Chaque test crée son propre utilisateur (email aléatoire, mot de passe fort) via `/auth`, puis nettoie ses données par suppression manuelle avant déconnexion. Aucun état partagé entre tests.

## Scénarios couverts

- `auth.spec.ts` — Inscription, connexion, déconnexion, restauration de session.
- `clients.spec.ts` — CRUD complet d'un client.
- `matters.spec.ts` — Création dossier, sous-dossier, sous-sous-dossier, renommage, suppression.
- `documents.spec.ts` — Upload d'un PDF, présence en liste, téléchargement, suppression.
- `permissions.spec.ts` — Deux utilisateurs distincts ne voient pas les dossiers l'un de l'autre.

## Tests de régression sécurité (`tests/security`)

```bash
bun run test:security
```

Vérifient en continu, contre la base réelle :

- **PII avocats** — `lawyers` illisible pour un visiteur, RPC d'annuaire (`list_public_lawyers`,
  `get_public_lawyer`) sans e-mail / téléphone / adresse / profile_id, `admin_list_lawyers`
  refusé hors Bâtonnier, escalade de rôle et changement de statut impossibles.
- **Dossiers & documents** — aucun accès anonyme à `matters`, `matter_documents`, `clients` ;
  un compte tiers ne voit ni ne crée rien pour autrui.
- **Stockage** — buckets privés `bar-media`, `bar-library`, `firm-templates` : listing,
  téléchargement, URL signée et upload refusés hors membres du dossier.
- **RPC** — `has_role` et `get_firm_stats` non exécutables anonymement, tandis que les RPC
  publics (`get_public_stats`, `get_public_lawyer`, `get_public_disciplinary_decisions`)
  restent accessibles aux visiteurs.

Les cas « utilisateur connecté » créent un compte jetable confirmé via la clé de service et le
suppriment en fin de suite ; ils sont automatiquement ignorés si cette clé est absente.

# San Andreas Bar Portal

Crée un site web premium, moderne et entièrement responsive pour le State Bar of San Andreas, l'institution officielle chargée de réglementer, superviser et représenter la profession d'avocat dans l'État de San Andreas.

Le site doit transmettre immédiatement les notions de justice, prestige, confiance, rigueur, impartialité, excellence et autorité publique.

Il ne doit pas ressembler à une startup ou à un site d'entreprise privée, mais à une institution gouvernementale américaine.

Direction artistique

Palette :

 Bleu marine (#153E75)

 Bleu foncé (#0E2C56)

 Blanc (#FFFFFF)

 Gris clair (#F8F9FA)

 Doré discret (#C8A44D)

Typographie :

 Playfair Display (titres)

 Inter (texte)

Style :

 Institutionnel

 Moderne

 Élégant

 Haut de gamme

 Animations sobres

 Beaucoup d'espace

 Icônes professionnelles

 Tables modernes

 Cartes premium

 Ombres discrètes

Le site doit donner l'impression d'être le portail officiel d'une administration.

Header

Créer un header fixe comprenant :

 Logo du State Bar of San Andreas

 Accueil

 Le Barreau

 Avocats

 Cabinets

 Services

 Formations

 Actualités

 Contact

À droite :

 Vérifier une licence

 Connexion

Hero

Grand visuel :

Tribunal de San Andreas.

Titre :

State Bar of San Andreas

Sous-titre :

"Serving Justice. Upholding Integrity. Protecting the Legal Profession."

Boutons :

 Trouver un avocat

 Vérifier une licence

 Devenir avocat

Section statistiques

Afficher sous forme de cartes :

 Avocats inscrits

 Cabinets enregistrés

 Licences actives

 Examens organisés

 Décisions disciplinaires

 Permanences juridiques

Présentation

Qui sommes-nous ?

Mission

Vision

Valeurs

Une photo du Bâtonnier.

Les services

Créer des cartes modernes.

Registre officiel des avocats

Permet de consulter l'ensemble des avocats inscrits.

Registre officiel des cabinets

Tous les cabinets autorisés.

Vérification des licences

Recherche instantanée.

Admission au Barreau

Présentation des démarches.

Formation continue

Catalogue.

Bibliothèque juridique

Codes.

Lois.

Jurisprudence.

Guides.

Commission disciplinaire

Présentation.

Procédure.

Décisions.

Aide juridictionnelle

Présentation.

Demande.

Conditions.

Mentorat

Présentation.

Inscription.

Suivi.

Registre des avocats

Créer une vraie page.

Table moderne.

Colonnes :

Photo

Nom

Numéro de licence

Cabinet

Spécialité

Ville

Statut

Recherche.

Filtres.

Tri.

Pagination.

Chaque avocat possède une fiche.

Fiche avocat

Photo.

Nom.

Licence.

Date d'admission.

Cabinet.

Spécialités.

Téléphone.

Email.

Adresse.

Carte professionnelle.

QR Code.

Registre des cabinets

Chaque cabinet affiche :

Logo

Nom

Numéro

Adresse

Responsable

Date de création

Nombre d'avocats

Statut

Vérification d'une licence

Champ :

Entrer un numéro.

Afficher :

✔ Active

❌ Suspendue

❌ Radiée

Avec :

Nom

Photo

Cabinet

Date

QR Code

Admissions

Créer une page expliquant :

Conditions

Étapes

Documents

Calendrier

Examen

Serment

Examen du Barreau

Créer :

Présentation

Calendrier

Inscription

Résultats

FAQ

Bibliothèque

Catégories :

Constitution

Code pénal

Code civil

Procédure

Jurisprudence

Modèles

Doctrine

Recherche.

Actualités

Communiqués.

Nominations.

Réformes.

Décisions.

Évènements.

Contact

Coordonnées.

Carte.

Horaires.

Formulaire.

Footer

Logo.

Liens utiles.

Mentions légales.

Protection des données.

Contact.

Réseaux sociaux.

Espace Avocat

Créer un portail sécurisé.

Dashboard :

Carte professionnelle.

Licence.

Cabinet.

Historique.

Messages.

Notifications.

Documents.

Téléchargements.

Espace Bâtonnier

Créer un tableau de bord complet.

Permettre :

Gestion des avocats

Gestion des cabinets

Validation des admissions

Création des licences

Création des cartes professionnelles

Gestion disciplinaire

Organisation des examens

Publication des actualités

Gestion des formations

Statistiques

Historique

Journal d'activité

Fonctionnalités

Prévoir les interfaces pour :

 Authentification

 Gestion des rôles

 Recherche

 Filtres

 Export PDF

 QR Codes

 Notifications

 Formulaires

 Téléchargements

 Responsive Desktop / Tablet / Mobile

Inspiration

S'inspirer du design des sites :

 American Bar Association

 State Bar of California

 New York State Bar Association

 U.S. Department of Justice

 Supreme Court of the United States

Ambiance générale

Le résultat doit donner l'impression d'un véritable portail officiel de l'État de San Andreas, utilisé quotidiennement par les avocats, les citoyens, les tribunaux et les institutions publiques. L'interface doit inspirer immédiatement confiance, professionnalisme et autorité.

Je souhaite une inscription à chaque fin de page "Site fictif crée pour un serveur fivem"

---

# Exploitation technique

Application autonome : **GitHub → Railway → Docker → Node → PostgreSQL**.
Aucune dépendance à un service tiers propriétaire — la base, l'authentification,
le stockage de fichiers et l'envoi d'e-mails sont assurés par le projet lui-même.

## Architecture

| Couche | Implémentation |
| --- | --- |
| Front + SSR | TanStack Start (React 19, Vite) |
| Serveur HTTP | [server/index.mjs](server/index.mjs) — Node natif, écoute sur `PORT` |
| Accès données | Client maison compatible PostgREST ([src/lib/pgrest](src/lib/pgrest), [src/backend/db](src/backend/db)) |
| Autorisation | Row-Level Security PostgreSQL (`SET LOCAL ROLE` + `request.jwt.claims`) |
| Authentification | JWT HS256 + bcrypt ([src/backend/auth](src/backend/auth)) |
| Fichiers | Volume disque + table `storage.objects` ([src/backend/storage](src/backend/storage)) |
| E-mails | SMTP via nodemailer ([src/backend/email](src/backend/email)) |

Les 500+ requêtes de l'application conservent la syntaxe `supabase.from(...).select(...)` :
elle est désormais compilée en SQL paramétré et exécutée sous le rôle PostgreSQL de
l'appelant, si bien que les 144 policies RLS d'origine restent la seule source
d'autorité en matière d'autorisation.

## Développement local

```sh
npm install
cp .env.example .env        # renseigner DATABASE_URL et AUTH_JWT_SECRET
npm run db:migrate
npm run db:seed-admin -- --email admin@example.com --password '<mot de passe>'
npm run dev
```

Sans instance PostgreSQL sous la main :

```sh
npm install --no-save embedded-postgres
node scripts/dev-postgres.mjs      # démarre PostgreSQL sur le port 55433
```

## Scripts

| Commande | Rôle |
| --- | --- |
| `npm run dev` | serveur de développement |
| `npm run build` | build de production (`dist/client` + `dist/server`) |
| `npm start` | démarre le serveur de production |
| `npm run db:migrate` | applique les migrations en attente |
| `npm run db:status` | liste les migrations appliquées / en attente |
| `npm run db:seed-admin` | crée le premier compte `batonnier` |
| `npm run verify` | vérification bout en bout (schéma, auth, CRUD, RLS, stockage) |
| `npm run test:unit` / `test:security` / `test:e2e` | suites de tests |

## Base de données

Les migrations vivent dans [db/migrations](db/migrations) et sont appliquées **une seule fois**,
dans l'ordre de leur préfixe numérique, chacune dans sa propre transaction.
[scripts/migrate.mjs](scripts/migrate.mjs) enregistre un checksum : modifier une migration déjà
appliquée provoque une erreur explicite au lieu d'une divergence silencieuse.
Aucune opération destructive n'est effectuée automatiquement.

`00000000000000_bootstrap_auth_storage.sql` crée sur un PostgreSQL standard les
primitives dont dépend le schéma métier : rôles `anon` / `authenticated` /
`service_role`, schéma `auth` (`auth.users`, `auth.uid()`, `auth.jwt()`) et schéma
`storage` (`storage.buckets`, `storage.objects`, `storage.foldername()`).

### Déploiement initial

1. Créer le service PostgreSQL sur Railway et exposer `DATABASE_URL` au service applicatif.
2. Déployer : le conteneur applique les migrations au démarrage (`RUN_MIGRATIONS_ON_BOOT`).
3. Créer le premier administrateur :
   ```sh
   railway run npm run db:seed-admin -- --email vous@exemple.com --password '<mot de passe>'
   ```

### Reprise de données existantes

Depuis une base PostgreSQL source (par exemple un projet Supabase) :

```sh
# 1. Export — schémas métier uniquement, sans les objets système du fournisseur
pg_dump "$SOURCE_DATABASE_URL" \
  --data-only --no-owner --no-privileges \
  --schema=public --schema=auth --schema=storage \
  --table='public.*' --table='auth.users' --table='storage.objects' \
  --file=dump.sql

# 2. Appliquer d'abord le schéma sur la cible
DATABASE_URL="$TARGET_DATABASE_URL" npm run db:migrate

# 3. Import
psql "$TARGET_DATABASE_URL" --single-transaction --file=dump.sql
```

Les mots de passe issus de Supabase sont des hachages bcrypt, directement
compatibles avec `auth.users.encrypted_password` : les comptes restent
utilisables. Les fichiers du stockage doivent être copiés séparément dans le
volume monté sur `STORAGE_ROOT`, en conservant l'arborescence `<bucket>/<chemin>`.

## Déploiement Railway

```
GitHub → Railway (service applicatif) → Docker → Node → PostgreSQL Railway
```

1. Pousser le dépôt sur GitHub, puis créer un service Railway depuis ce dépôt.
   [railway.json](railway.json) sélectionne le [Dockerfile](Dockerfile) et la sonde `/api/health`.
2. Ajouter un service **PostgreSQL** dans le même projet.
3. Variables du service applicatif (voir [.env.example](.env.example)) :
   - `DATABASE_URL=${{ Postgres.DATABASE_URL }}`
   - `AUTH_JWT_SECRET` — au moins 32 caractères (`openssl rand -base64 48`)
   - `PUBLIC_SITE_URL` — l'URL publique du service
   - `STORAGE_ROOT=/data/storage`
   - `SMTP_*` et `AI_*` si ces fonctions sont utilisées
4. Monter un **volume** sur `/data` : sans lui, les documents importés
   disparaissent à chaque redéploiement.
5. Ne pas exposer publiquement le service PostgreSQL : la communication passe par
   le réseau privé Railway.

`PORT` est fourni par Railway et respecté par le serveur ; aucun port n'est codé en dur.

## Sécurité

- Aucun secret dans le dépôt : `.env` est ignoré par Git, `.env.example` ne contient que des noms.
- Les identifiants PostgreSQL ne transitent que par `DATABASE_URL`.
- Toutes les requêtes générées sont paramétrées ; les identifiants SQL sont validés puis échappés.
- Les mots de passe sont hachés avec bcrypt ; les jetons de rafraîchissement et de
  récupération ne sont stockés que sous forme de hachage SHA-256.
- Les URL de fichiers signées sont des HMAC à durée de vie courte, vérifiés en temps constant.
- Le conteneur s'exécute sous un utilisateur non privilégié.

## Développement

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

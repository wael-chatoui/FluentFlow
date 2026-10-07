# Preply Lessons

Plateforme de suivi de mes élèves Preply. En prod sur <https://fluent-flow-mu.vercel.app>
(back office : <https://fluent-flow-mu.vercel.app/admin>).

- **Prof** (`/teacher`, en français) : après un cours, je colle la transcription Preply et mes
  notes Canva ; l'IA génère en arrière-plan le bilan (résumé, vocabulaire, corrections, grammaire,
  expressions, devoirs) et les exercices, publiés directement à l'élève (ou gardés en brouillon avec
  « Relire avant de publier »). Aussi : tableau de bord « À traiter », invitations d'élèves (lien à
  copier), fiche élève avec « Notes privées » (jamais envoyées à l'IA) et « Contexte pour l'IA »,
  « Préparer le prochain cours » (plan de cours généré par l'IA), import d'anciens bilans.
- **Élève** (`/student`, en anglais) : accès sur invitation (Google ou lien magique), onboarding,
  bilans (Save as PDF), exercices façon Duolingo (QCM, texte à trous, associer FR ↔ EN, écoute),
  révision des erreurs, banque de mots et flashcards, profil (suppression du compte).
- **Admin** (`/admin`, en français) : statistiques et coût IA réel, utilisateurs, éditeur de
  leçons, explorateur de tables, journal d'audit.

Stack : Next.js 16 (Pages Router, JavaScript) · Supabase (auth + Postgres) · n'importe quelle API
d'IA compatible OpenAI (par défaut Qwen via OpenRouter) · Vercel. Décisions et état du projet :
[docs/CONTEXT.md](docs/CONTEXT.md) ; contrat d'API : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Mise en place

### 1. Base de données (CLI Supabase)

Les migrations sont dans `supabase/migrations/` (0001 pipeline, 0002 prof, 0003 révision,
0004 back office, 0005 import, 0006 publication + accès sur invitation + contexte IA + plans +
journal IA + verrouillage des tables). Elles s'appliquent avec le CLI Supabase
(`brew install supabase/tap/supabase`), depuis le dossier `webapp/`, déjà relié au projet de prod :

```bash
pnpm db:status   # migrations locales vs prod
pnpm db:push     # applique en prod celles qui manquent
```

Si la session a expiré : `supabase login`, puis `pnpm db:link` (projet `ycxemjutfkfxxmmfqqgq`,
demande le mot de passe de la base).

- **État** : 0001 à 0006 sont toutes appliquées en prod. L'historique a été réparé le 2026-09-30
  (0001–0003 et 0005 avaient été passées à la main dans le SQL Editor et ont été marquées comme
  appliquées), puis 0004 et 0006 ont été poussées par `pnpm db:push`.
- **Ne passe plus de migration à la main** dans le SQL Editor : `pnpm db:push` ne le saurait pas.
  Si ça arrive quand même : `supabase migration repair --status applied 000N --linked`.
- Nouvelle migration : `supabase/migrations/000N_nom.sql`, idempotente, avec les
  `grant … to service_role` des nouvelles tables, testée en local (`pnpm db:start`).
- 0002 et 0004 contiennent encore un bloc « remplace l'email » : ne les modifie plus (sans effet tel
  quel), le compte prof/admin se crée avec le script de l'étape 5.

### 2. Authentification (Supabase → Authentication)

- **URL Configuration** : Site URL = `https://fluent-flow-mu.vercel.app` ; Redirect URLs =
  `https://fluent-flow-mu.vercel.app/**` et `http://localhost:3000/**` (les `/**` sont nécessaires :
  les redirections portent un `?next=`). Sans l'entrée localhost, la connexion Google en local
  (branché sur la base de prod) renvoie vers la prod.
- **Providers → Google** activé, avec un client OAuth Google Cloud dont l'URI de redirection est le
  callback affiché par Supabase (`https://ycxemjutfkfxxmmfqqgq.supabase.co/auth/v1/callback`).
- **Accès sur invitation, sans mot de passe** : laisse « Allow new users to sign up » activé. Une
  adresse Google jamais invitée crée un compte **en attente** (`approved = false`, trigger de 0006)
  qui ne voit que `/pending` jusqu'à ce que tu l'approuves (ou le refuses, ce qui le supprime) depuis
  « À traiter » ou le back office. Le lien magique de `/login` ne crée jamais de compte.
  « Inviter un élève » donne un lien à usage unique (`/auth/confirm?token_hash=…&type=invite`) à
  copier dans le chat Preply : il marche sur n'importe quel appareil, quels que soient les templates.
- **E-mails** : le serveur d'envoi par défaut de Supabase n'accepte que quelques e-mails par heure ;
  configure ton propre SMTP si tu envoies souvent les invitations ou les liens par e-mail.
- **Templates d'e-mail (optionnel)**. Formats de lien compris par `/auth/confirm` et `/auth/callback` :

  | Lien | Vient de | Appareil |
  |---|---|---|
  | `?code=…` (PKCE) | Google, lien magique demandé sur `/login` avec le template par défaut | même navigateur seulement |
  | `?token_hash=…&type=…` (`invite`, `magiclink`, `email`, `signup`, `recovery`) | liens créés par l'app, templates avec `{{ .TokenHash }}` | n'importe lequel |
  | `#access_token=…&refresh_token=…` | invitation envoyée par e-mail avec le template par défaut | n'importe lequel |

  Pour qu'un lien magique demandé sur l'ordinateur s'ouvre aussi sur le téléphone, remplace le lien
  des templates (Authentication → Emails → Templates) :
  - **Magic Link** : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`
  - **Invite user** : `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite`

  Contrepartie : ces liens mènent toujours au Site URL (la prod, même quand tu testes en local) et
  perdent le `?next=` (l'élève arrive sur son accueil). Après un lien `token_hash` ou `#access_token`,
  l'app demande « c'est bien ton compte ? » avant de continuer : c'est voulu (protection contre
  l'envoi d'un lien piégé).

### 3. IA (OpenRouter + Qwen)

1. Compte sur <https://openrouter.ai> (email ou Google, pas de pièce d'identité), quelques dollars
   de **Credits**, puis une clé dans **Keys** (`sk-or-…`, avec une limite de dépense si tu veux).
2. Renseigne `AI_API_KEY` en local et sur Vercel. `AI_BASE_URL` et `AI_MODEL` valent par défaut
   `https://openrouter.ai/api/v1` et `qwen/qwen3.7-flash`.

- **Coût réel** : avec OpenRouter, chaque appel demande `usage: { include: true }` et reçoit son
  coût exact (`usage.cost`, en dollars), enregistré dans `ai_generations` (une ligne par tentative,
  échecs compris) et affiché dans le back office. Avec un autre fournisseur, le coût est estimé
  (tokens × `AI_PRICE_INPUT_PER_M` / `AI_PRICE_OUTPUT_PER_M`, défauts 0,05 $ / 0,40 $ par million).
  Mesuré : ~0,001 $ par leçon (≈ 9 000 tokens, ~75 s).
- **Limites** : `AI_TIMEOUT_MS` = budget total d'une génération, relances comprises (défaut
  240 000, plafonné à 270 000 car les routes IA ont `maxDuration = 300` s). `AI_MAX_TOKENS` (défaut
  8192) : à augmenter si des leçons avec beaucoup d'exercices reviennent coupées.
- **Mode démo** : hors production, sans `AI_API_KEY` ou avec `AI_DEMO=1`, l'app renvoie une leçon
  et un plan d'exemple sans appeler l'IA. `AI_DEMO` est ignoré en production (sans clé : erreur
  « IA non configurée »).
- Alternatives compatibles `/chat/completions` (Alibaba Model Studio, DeepSeek…) : voir `.env.example`.

### 4. Variables d'environnement

```bash
cp .env.example .env.local   # puis remplis les valeurs
```

Chaque variable est commentée dans `.env.example`. Sur Vercel (Settings → Environment Variables,
Production et Preview) :

| Variable | En prod |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | obligatoires |
| `SUPABASE_SERVICE_ROLE_KEY` | obligatoire, serveur uniquement |
| `NEXT_PUBLIC_SITE_URL` | obligatoire : `https://fluent-flow-mu.vercel.app` (jamais localhost) |
| `AI_API_KEY` | obligatoire, serveur uniquement |
| `AI_BASE_URL`, `AI_MODEL`, `AI_TIMEOUT_MS`, `AI_MAX_TOKENS`, `AI_PRICE_*` | optionnelles (défauts ci-dessus) |
| `RESEND_API_KEY`, `EMAIL_FROM` | optionnelles (emails transactionnels : alertes prof, notifications élève ; console en démo) |
| `BACKOFFICE_HOSTS` | optionnelle (sous-domaine dédié au back office, voir plus bas) |

`SUPABASE_SERVICE_ROLE_KEY` et `AI_API_KEY` ne doivent **jamais** être préfixées `NEXT_PUBLIC_`.
Les `NEXT_PUBLIC_*` sont figées au build : redéploie après les avoir changées.

### 5. Compte prof / admin

```bash
node --env-file=.env.local scripts/bootstrap-owner.mjs ton@email.com             # prof + admin
node --env-file=.env.local scripts/bootstrap-owner.mjs ton@email.com --no-admin  # prof sans droits admin
```

Le script (qui remplace l'édition à la main de 0002 et 0004) utilise `NEXT_PUBLIC_SUPABASE_URL` et
`SUPABASE_SERVICE_ROLE_KEY` du fichier donné. Il met `role = teacher`, `approved = true` et
`is_admin` dans `app_metadata`. Si le compte n'existe pas encore, il le crée et affiche un lien de
connexion à usage unique (vers `NEXT_PUBLIC_SITE_URL`, défaut `http://localhost:3000`). Ensuite,
déconnecte-toi puis reconnecte-toi pour rafraîchir la session.

### 6. Dev local

Prérequis : Node ≥ 22, pnpm, Docker (Colima : `colima start`) et le CLI Supabase.

```bash
pnpm install
pnpm db:start   # Supabase local : applique toutes les migrations et affiche les clés
```

Crée `.env.development.local` (ignoré par git ; prioritaire sur `.env.local` pour `pnpm dev`
seulement) avec les clés affichées (`supabase status -o env` les redonne) :

```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ANON_KEY locale>
SUPABASE_SERVICE_ROLE_KEY=<SERVICE_ROLE_KEY locale>
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

```bash
node --env-file=.env.development.local scripts/bootstrap-owner.mjs toi@example.com
pnpm dev
```

- <http://localhost:3000> : l'app. Google n'est pas configuré en local : connecte-toi avec le lien
  affiché par le script (compte créé à l'instant) ou avec un lien magique.
- <http://127.0.0.1:54324> : les e-mails envoyés (liens magiques, invitations).
- <http://localhost:3000/admin> ou <http://backoffice.localhost:3000> : le back office.
- <http://localhost:3000/dev/preview> : aperçu d'une leçon et des exercices sans connexion (404 en prod).
- Sans `AI_API_KEY` : mode démo. `pnpm db:stop` arrête la base locale. Pour repasser sur la base de
  prod, renomme `.env.development.local`.

### 7. Tests

```bash
pnpm test    # Vitest (tests/), sans base ni clé IA
pnpm build
```

Les deux doivent passer avant chaque PR.

## Import de leçons existantes

Onglet **Importer** (espace prof) : choisis un élève, dépose d'anciens bilans (PDF, `.txt`, `.md`,
4 Mo max par fichier) et/ou colle des liens Google Docs ou de fichiers Google Drive (PDF, `.txt`,
`.md`), partagés en « Tous les utilisateurs disposant du lien » (pas de dossiers, Sheets ni Slides). Jusqu'à 20 documents
par import ; date et titre sont détectés, le nombre et les types d'exercices se règlent. Chaque
document devient une leçon complète (bilan + exercices), générée en arrière-plan. Les PDF scannés
(images) contiennent peu de texte : colle le texte à la main dans ce cas.

## Back office

Même app, sous <https://fluent-flow-mu.vercel.app/admin>. Réservé aux comptes
`app_metadata.is_admin = true` (étape 5) ; les autres voient « Accès réservé ». On y trouve :

- tableau de bord : activité sur 30 jours, coût IA réel, taux d'échec et durée des générations ;
- utilisateurs : invitation (lien à copier ou e-mail), approbation des comptes en attente, rôle,
  admin, suspension, suppression, lien de connexion, « Contexte pour l'IA » (impossible de retirer
  le dernier admin ou le dernier prof) ;
- leçons : éditeur complet (bilan, exercices, visibilité), en lecture seule pendant une génération ;
- explorateur de tables en lecture seule et journal d'audit de toutes les actions admin.

**Sous-domaine dédié (optionnel, pas utilisé aujourd'hui)** : ajoute le domaine au même projet
Vercel (Settings → Domains, avec l'enregistrement DNS que Vercel indique), mets-le dans
`BACKOFFICE_HOSTS` (liste séparée par des virgules, défaut `backoffice.localhost`), et ajoute
`https://<ce-domaine>/**` aux Redirect URLs de Supabase. Sur ce domaine tout reste sous `/admin`, et
`NEXT_PUBLIC_SITE_URL` sert aux liens envoyés aux élèves et au lien « Espace prof ».

## Stockage des PDF

L'app ne stocke aucun fichier. Le bilan est une page web : l'élève clique « Save as PDF » (feuille
d'impression dédiée, seul le bilan est imprimé). Les PDF vivent dans Google Drive : colle le lien du
dossier Drive de l'élève dans sa fiche (il le voit dans son profil) et, si tu veux, le lien du PDF sur
chaque leçon. Ce sont de simples liens.

## Déploiement

- Vercel : `main` = production (<https://fluent-flow-mu.vercel.app>). Branches `feat/…`, `fix/…` →
  PR vers `develop` (tests + build verts) → `develop` vers `main`.
- **Migrations avant le code** : applique en prod (`pnpm db:status`, `pnpm db:push`) toute migration
  dont dépend le code **avant** de le merger dans `main`.
- **Fluid compute** activé (Vercel → Settings → Functions) : les générations continuent après la
  réponse 202 (`waitUntil`), jusqu'à 300 s. Sans lui, une génération peut être coupée : la leçon
  reste « en cours » puis apparaît comme bloquée (à régénérer) au bout de 5 min.
- Variables d'environnement : voir l'étape 4, dont `NEXT_PUBLIC_SITE_URL=https://fluent-flow-mu.vercel.app`.
- Les déploiements Preview ne sont pas dans les Redirect URLs de Supabase : la connexion y renvoie
  vers la prod.
- Après un déploiement qui touche la génération : crée une leçon, ferme l'onglet, vérifie qu'elle
  finit publiée.

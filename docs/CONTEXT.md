# Contexte du projet — Preply Lessons (repo « FluentFlow »)

> Fichier chargé automatiquement dans chaque conversation Claude (via `CLAUDE.md`).
> **À tenir à jour** : toute tâche qui change une décision, une feature, le schéma, l'état des
> branches ou des migrations met à jour ce fichier dans le même commit (surtout « État actuel »).
> Détails techniques : `docs/ARCHITECTURE.md` (contrat d'API) et `AGENTS.md` (règles de code).

## En bref

- **Qui** : Wael C., étudiant en informatique à Paris, prof de français natif sur Preply
  ([profil](https://preply.com/en/tutor/7640969)). Méthode axée sur la conversation (règle 70/30 :
  l'élève parle 70 % du temps), ambiance détendue, une notion de grammaire par cours.
- **Quoi** : une webapp pour son suivi d'élèves. Après chaque cours, Wael colle la transcription
  Preply + ses notes Canva → une IA génère le **bilan** (résumé, vocabulaire, corrections, grammaire,
  expressions, devoirs) + des **exercices façon Duolingo** (QCM 3 choix, texte à trous, associer
  FR ↔ EN), publiés à l'élève qui révise et s'entraîne.
- **Utilisateurs** : un seul prof (Wael, aussi admin), une dizaine d'élèves anglophones (fiches
  historiques dans `../students/` : Anxhela, Benjamin, Carson, Catherine, Gabriel, Kiren, Mark_A,
  Oliver, Rebecca).
- **Langues** : interface prof et back office en **français**, interface élève (login, onboarding,
  `/student/*`) en **anglais**, contenu des leçons en **français** (avec traductions anglaises).
- **Priorités de Wael** : un flux de fin de cours très rapide et un coût IA quasi nul.

## Dossiers

- `/Users/wael/Documents/Preply/` (pas un repo git) : `agent.md` (ancien flux de préparation de cours
  par IA : bilan HTML → PDF → Google Drive, plan du tuteur dans le chat — la webapp le remplace),
  `students/` (fiches `.md` et anciens PDF des élèves), `webapp/`.
- `webapp/` : repo git `github.com/wael-chatoui/FluentFlow` (ancien nom `teaching-platform`).

## Stack et services

- **Next.js 16, Pages Router, JavaScript** (pas de TypeScript), imports absolus `@/`. Next 16 diffère
  des versions connues : `proxy.js` remplace le middleware, docs dans `node_modules/next/dist/docs/`.
- **Supabase** : auth (Google + lien magique, sans mot de passe) et Postgres. Projet de prod
  `ycxemjutfkfxxmmfqqgq`. Toutes les lectures/écritures passent par les routes API avec la clé
  service role ; le navigateur n'a aucun accès direct aux tables (migration 0006).
- **IA** : n'importe quelle API compatible OpenAI. Par défaut **OpenRouter + `qwen/qwen3.7-flash`**
  (~0,001 $ par leçon, ~75 s). Sans clé en local : mode démo.
- **Hébergement** : Vercel, projet en prod sur **<https://fluent-flow-mu.vercel.app>** (Fluid compute
  requis : génération jusqu'à 300 s en arrière-plan). Back office : même app, sous
  <https://fluent-flow-mu.vercel.app/admin>. Pas de domaine perso pour l'instant (`backoffice.lurl.com`
  dans d'anciennes docs n'était qu'un exemple) ; `BACKOFFICE_HOSTS` ne sert que si on ajoute un jour
  un sous-domaine dédié au back office.
- **PDF** : pas de stockage ; l'élève fait « Save as PDF » (feuille d'impression dédiée) et les
  liens Google Drive (dossier de l'élève, PDF d'une leçon) sont de simples URLs.

## Fonctionnalités

**Prof** (`/teacher`, FR)
- Tableau de bord : élèves, « À traiter » (demandes d'accès, générations échouées ou bloquées,
  brouillons, régénérations ratées), élèves sans cours depuis 14 jours, activité récente.
- Inviter un élève : lien d'invitation à copier (à envoyer dans le chat Preply) ou e-mail.
- Nouvelle leçon : transcription + notes Canva (boutons « Coller »), options d'exercices, case
  « Relire avant de publier » ; la génération tourne en arrière-plan, on peut quitter la page.
- Page leçon : suivi de génération, aperçu élève, publier / retirer, tester les exercices,
  modifier ou supprimer un exercice, résultats, sources, régénérer (sources modifiables).
- Import de leçons existantes (PDF, Google Docs/Drive) en lot, dates et titres détectés.
- Fiche élève : profil, « Notes privées » (jamais envoyées à l'IA) et « Contexte pour l'IA »,
  lien de connexion, **« Préparer le prochain cours »** (plan du tuteur généré par l'IA selon la
  méthode d'`agent.md`, questionnaire devoirs pour un cours d'essai).

**Élève** (`/student`, EN)
- Connexion Google ou lien magique, sur invitation ; comptes non invités en attente (`/pending`).
- Onboarding pas à pas (look à part, voulu par Wael), accueil façon Duolingo (progression, pas de
  streak ni XP), liste des leçons, bilan (Save as PDF), exercices avec écoute (voix française),
  révision des erreurs, banque de mots + flashcards, profil (suppression de compte).

**Admin** (`/admin`, FR) : stats et coût IA réel, utilisateurs (invitation, approbation, rôle,
bannissement, suppression), éditeur complet de leçons, explorateur de tables, journal d'audit.

## Décisions (ne pas revenir dessus sans Wael)

| Sujet | Décision |
|---|---|
| Publication | Directe par défaut ; option « Relire avant de publier » (brouillon `hidden`) ; publier / retirer à tout moment. |
| Accès | Sur invitation, sans mot de passe (Google + lien magique). Inscription spontanée → compte « en attente » à approuver. |
| Rôles | Dans `app_metadata` (`role`, `is_admin`, `approved`), jamais `user_metadata`. |
| Accents (textes à trous) | Tolérés avec avertissement, sauf quand l'accent change le mot : mots ≤ 3 lettres, paires (a/à, ou/où, sur/sûr…), dernière lettre et terminaisons -é(e)(s). œ/oe et tiret/espace équivalents. |
| Notes privées | Jamais envoyées à l'IA ; seul « Contexte pour l'IA » l'est. Textes non fiables encadrés comme données dans les prompts. |
| Intégrité des scores | Réponses envoyées au navigateur (feedback instantané, entraînement formatif) : risque accepté ; le serveur recorrige, sauvegardes idempotentes et versionnées. |
| Régénération | Remet à zéro progression, meilleur score et erreurs (résultats comptés à partir de `generated_at`). |
| Génération | En arrière-plan (réponse 202), idempotente (`clientKey`), jamais bloquée en « generating ». |
| Données | Suppression de compte = suppression complète. Déconnexion = tous les appareils. |
| Design | Système ludique (tokens `--st-*`), contraste WCAG AA ; l'onboarding garde son propre style. |
| IA | Le modèle le moins cher qui marche (Qwen via OpenRouter) ; coût suivi dans `ai_generations`. |

## Base de données et migrations

- Migrations dans `supabase/migrations/` : 0001 pipeline, 0002 prof (obsolète, remplacée par
  `scripts/bootstrap-owner.mjs`), 0003 révision, 0004 back office, 0005 import, 0006 publication +
  accès sur invitation + contexte IA + plans + journal IA + verrouillage des tables + droits service role.
- **Local** : `pnpm db:start` (Supabase CLI + Docker/Colima) applique toutes les migrations ;
  e-mails visibles sur <http://127.0.0.1:54324>. Compte prof : `node --env-file=… scripts/bootstrap-owner.mjs <email>`.
- **Prod** (depuis le terminal, dossier `webapp/`, déjà relié au projet) : `pnpm db:status` pour
  comparer, `pnpm db:push` pour appliquer (`supabase login` / `pnpm db:link` si la session a expiré).
  Historique réparé le 2026-09-30 (0001–0003 et 0005 avaient été passées à la main) ; 0004 et 0006
  appliquées le même jour. Toutes les migrations locales sont en prod.
  Toujours appliquer une migration en prod **avant** de merger dans `main` le code qui en dépend.

## Git et déploiement

- `main` = production (Vercel). `develop` = branche d'intégration. Une branche par feature
  (`feat/…`, `fix/…`, `chore/…`, `docs/…`) → PR vers `develop` → squash merge (build + tests OK).
  `develop` → `main` quand les migrations nécessaires sont appliquées en prod.
- Messages de commit conventionnels (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`).
- Vérifications avant chaque PR : `pnpm test` (Vitest) et `pnpm build`.

## État actuel (2026-09-30)

- Passe « fiabilité + features » **en prod** (PR #13, `develop` → `main`), découpée en PR par feature
  #2 à #12 dans `develop`. Build + 429 tests Vitest verts à chaque étape. Migrations 0001–0006 en prod.
- Pas encore fait : parcours prof et élève complets dans le navigateur (reportés pour économiser des
  tokens) — à faire en local (`pnpm db:start`, compte `prof@local.test`) puis sur la prod.
- À faire côté Wael : Supabase → URL Configuration (Site URL `https://fluent-flow-mu.vercel.app`,
  Redirect URLs `https://fluent-flow-mu.vercel.app/**` et `http://localhost:3000/**`) ;
  `NEXT_PUBLIC_SITE_URL=https://fluent-flow-mu.vercel.app` sur Vercel ; remplir « Contexte pour l'IA »
  de chaque élève ; sortir le secret OAuth en clair de `../.agents/mcp_config.json`.
- Idées reportées par la relecture : colonne `lessons.generation_started_at` (migration 0007) pour un
  délai « bloquée » plus précis ; 409 `pending_exists` à l'invitation d'un compte en attente.

## Pistes pour la suite

Mode sombre, répétition espacée des mots (flashcards sauvegardées), nouveaux types d'exercices
(remettre les mots dans l'ordre, traduction, dictée), OCR des PDF scannés, import des fiches
`students/*.md`, export PDF côté serveur vers Drive.

# Preply Lessons

Plateforme de suivi pour mes cours de français sur Preply.

**Côté prof** : après chaque cours, je colle la transcription Preply et mes notes Canva
pour un élève → une IA génère le bilan de la leçon + des exercices, publiés directement
à l'élève.

**Côté élève** (interface en anglais) : il lit son bilan (vocabulaire, corrections,
grammaire, devoirs), l'exporte en PDF, et s'entraîne avec des exercices façon Duolingo
(QCM à 3 choix, phrases à trous, associer mot ↔ traduction).

Stack : Next.js 16 (Pages Router) · Supabase (auth + Postgres) · n'importe quel LLM
compatible OpenAI (par défaut Qwen `qwen-flash`). Détails techniques :
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Mise en place

### 1. Base de données (Supabase → SQL Editor)

1. Exécute `supabase/migrations/0001_lesson_pipeline.sql` (idempotent, peut être relancé).
2. Exécute `supabase/migrations/0003_student_review.sql` (révision des erreurs côté élève).
3. Connecte-toi une fois sur le site avec ton compte prof.
4. Ouvre `supabase/migrations/0002_set_teacher.sql`, remplace l'email par le tien,
   exécute-le, puis déconnecte-toi / reconnecte-toi.

### 2. Authentification (Supabase → Authentication)

- **URL Configuration** : Site URL = ton domaine Vercel ; Redirect URLs =
  `https://<ton-domaine>/**` et `http://localhost:3000/**`. Sans l'entrée localhost,
  la connexion Google en local renvoie vers la version Vercel.
- **Providers → Google** activé (client OAuth Google Cloud avec l'URL de callback Supabase).

### 3. Clé IA (Qwen, le moins cher)

1. Crée un compte sur Alibaba Cloud Model Studio (site international) :
   <https://bailian.console.alibabacloud.com/> — un numéro de téléphone européen suffit.
2. Crée une clé API (API Keys), région Singapour/international.
3. Renseigne `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (voir `.env.example`).

Coût estimé : < 1 $/mois pour ~60 leçons. Sans clé en local, un **mode démo**
renvoie une leçon d'exemple pour tester l'interface.

Alternative : DeepSeek (`AI_BASE_URL=https://api.deepseek.com`, `AI_MODEL=deepseek-flash`).

### 4. Variables d'environnement

```bash
cp .env.example .env.local   # puis remplis les valeurs
```

Sur Vercel : mêmes variables dans Settings → Environment Variables.
`SUPABASE_SERVICE_ROLE_KEY` et `AI_API_KEY` ne doivent **jamais** être préfixées
`NEXT_PUBLIC_`.

### 5. Lancer

```bash
pnpm install
pnpm dev
```

- <http://localhost:3000> — l'app
- <http://localhost:3000/dev/preview> — aperçu d'une leçon + exercices sans connexion (dev uniquement)

## Stockage des PDF

Les bilans sont des pages web ; l'élève (ou toi) fait « Save as PDF » depuis la page.
Les PDF vivent dans Google Drive : renseigne le lien du dossier Drive de chaque élève
dans sa fiche, et éventuellement le lien du PDF sur chaque leçon.

@AGENTS.md
@docs/CONTEXT.md

# Instructions pour Claude

- Le contexte du projet (qui, quoi, décisions, état actuel) est dans `docs/CONTEXT.md` et les règles
  de code dans `AGENTS.md` : les deux sont chargés ci-dessus, pars de là plutôt que de redécouvrir le
  projet. Avant de toucher une route API, une table ou une réponse JSON, lis `docs/ARCHITECTURE.md`.
- Réponds à Wael en français. Code, commentaires et noms en anglais ; textes d'interface en français
  (prof, back office) ou en anglais (élève), comme décrit dans `AGENTS.md`.
- Respecte les décisions du tableau de `docs/CONTEXT.md` ; si une demande les contredit, signale-le
  avant d'agir.
- Toute tâche qui change le projet (feature, décision, migration, état des branches ou du déploiement)
  met à jour `docs/CONTEXT.md` (section « État actuel » et les sections concernées) et, si l'API change,
  `docs/ARCHITECTURE.md`, dans le même commit.
- Git : une branche par feature depuis `develop`, PR vers `develop`, `pnpm test` et `pnpm build` verts
  avant de merger. Ne jamais merger dans `main` du code qui dépend d'une migration pas encore appliquée
  en prod.
- Base de données : nouvelle migration = nouveau fichier `supabase/migrations/000N_nom.sql` idempotent,
  testé en local (`pnpm db:start`), avec les `grant … to service_role` des nouvelles tables.

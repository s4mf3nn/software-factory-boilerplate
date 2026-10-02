# Tableau de suivi (GitHub Issues + Project)

Le suivi visuel repose sur des issues générées depuis `specs/` : une issue **spec** par spec, une issue **tâche** par tâche du `plan.md`, reliées (sous-tickets et liste de tâches dans la spec). Personne ne déplace de carte à la main : le statut vient de l'état réel des PR.

| Statut | Quand |
|---|---|
| `todo` | tâche planifiée, aucune PR |
| `in-progress` | `/implement` a posé le bail (`node scripts/board.mjs start`) |
| `in-review` | une PR de la tâche est ouverte |
| `done` | une PR de la tâche est fusionnée (issue fermée) |

Une spec passe `in-progress` dès qu'une de ses tâches a démarré, et `done` quand toutes les tâches le sont. Le lien tâche ↔ PR se fait par le nom de branche `spec-xxxx-t#-slug` (posé par `/implement`).

## Fonctionnement

- `scripts/board.mjs sync` crée ou met à jour les issues (idempotent, repérées par un marqueur `<!-- factory-id: ... -->` dans le corps). Il pose les étiquettes `factory`, `spec` / `task` et `status:*`.
- `.github/workflows/board.yml` le lance après chaque fusion qui touche `specs/`, à chaque ouverture, réouverture ou fermeture de PR, et à la demande. Il lit toujours `main`.
- Les spec en PR non fusionnée n'ont pas d'issue : le tableau suit ce qui est fusionné.
- Ne modifie pas le titre ni le corps d'une issue générée : la prochaine synchronisation l'écrase. Les étiquettes ajoutées à la main sont conservées.

## Mise en place du Project (une fois, 2 minutes)

Sans Project, les issues et leurs étiquettes de statut fonctionnent déjà (filtre `label:status:in-review`). Pour la vue Kanban :

1. Crée un Project (vue Board) sur ton compte ou ton organisation. Dans « Status », garde les colonnes `Todo`, `In progress`, `Done` et ajoute `In review`.
2. Crée un PAT (classic, portée `project` et `repo`) et enregistre-le comme secret de dépôt `PROJECT_TOKEN`. Le `GITHUB_TOKEN` ne peut pas écrire dans un Project utilisateur.
3. Ajoute la variable de dépôt `BOARD_PROJECT` = `<propriétaire>/<numéro du project>`.
4. Lance le workflow `board` à la main (Actions → board → Run workflow).

En local : `BOARD_PROJECT=<propriétaire>/<numéro> node scripts/board.mjs sync` (`--dry-run` pour voir sans écrire ; le Project n'est alors pas touché).

## Limites

- `in-progress` n'est posé que si l'issue existe déjà au moment du bail ; sinon `/implement` continue et la carte passe directement à `in-review`.
- Une tâche supprimée du plan garde son issue (à fermer à la main).
- Les statuts ne remontent que si les branches de tâche respectent `spec-xxxx-t#-slug`.

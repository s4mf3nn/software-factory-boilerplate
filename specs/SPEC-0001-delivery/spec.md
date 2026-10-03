# SPEC-0001 : Livraison et cible réelle

Statut : BROUILLON
Risque estimé : élevé (livraison, secrets, retour arrière)
Dépend de : SPEC-0000
Tests de contrat : `tests/acceptance/SPEC-0001.test.ts`

## Objectif
Livrer le socle posé par SPEC-0000 sur la cible décrite dans `docs/adr/0001-stack.md` (ligne « Livraison »), revenir en arrière sans perte, et vérifier chaque application sur sa cible réelle en CI. Après cette spec, chaque spec livrée peut partir en production par le workflow `release`.

## Critères d'acceptation
<!-- À adapter à l'ADR-0001, puis écrire les assertions dans tests/acceptance/SPEC-0001.test.ts.
CA1 à CA3 se vérifient sur la cible (workflow `release` à blanc, job `e2e`) : leur preuve est le run de CI cité dans la
PR. Le contrat Vitest couvre ce qui se vérifie sans cible. Sans livraison (ex. bibliothèque interne), CA1 et CA2 sont
sans objet : le dire ici. -->
- **CA1** : `pnpm release` livre chaque application sur la cible de l'ADR-0001, avec les secrets de l'environnement GitHub `production` (jamais en argument ni dans le dépôt). Son mode à blanc passe quand la cible en offre un.
- **CA2** : `pnpm release` applique les migrations avant de déployer le code, et chaque migration reste compatible avec la version précédente du code (ajout d'abord, retrait dans une livraison suivante). Le retour arrière de chaque application est la commande ou la procédure écrite dans l'ADR-0001, répétée une fois sur la cible ou un environnement de préproduction.
- **CA3** : `pnpm test:e2e` démarre chaque application et les services dont elle a besoin (base, API), puis vérifie sur la cible réelle le point de santé de chaque application (CA1 de SPEC-0000). Le job `e2e` de la CI les lance et passe.

## Contrat d'interface
- Scripts de `package.json` : `release` (livraison, avec son mode à blanc s'il existe), `test:e2e` (cible réelle, CI seulement).
- Workflow `.github/workflows/release.yml` : variables d'environnement exposées depuis les secrets de `production`, une par ligne.
- Job `e2e` de `.github/workflows/ci.yml` : services nécessaires (base, application démarrée).

## Parcours sur cible réelle
- Chaque application démarre et répond à son point de santé.

## Hors périmètre
Toute fonctionnalité métier ; les parcours métier sur cible réelle, écrits par les specs qui les créent.

## Contraintes
Exécutée après SPEC-0000, en parallèle des premières specs métier : elle ne touche pas `src/features/`.

## Questions ouvertes
À vider avant de passer le statut à VALIDÉE.

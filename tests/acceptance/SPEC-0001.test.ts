import { describe, it } from "vitest";

// Contrat de SPEC-0001 : à écrire par l'humain, avec des assertions complètes, avant de valider la spec.
// CA1 à CA3 se prouvent sur la cible (workflow release à blanc, job e2e) ; ce fichier couvre ce qui se vérifie sans elle.
// Une fois ce fichier fusionné sur main, un agent n'a le droit que de retirer `.skip` (scripts/check-contract.mjs).
describe.skip("SPEC-0001 delivery", () => {
  it.todo("CA1 : release script reads its secrets from the environment only");
});

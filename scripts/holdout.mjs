#!/usr/bin/env node
// Scénarios cachés (`tests/holdout/SPEC-XXXX.test.ts`, ou `.test.tsx` quand ils rendent une interface) : écrits avec
// la spec, validés par l'humain, jamais vus par l'agent producteur. Ils vérifient que l'implémentation satisfait
// l'intention, pas seulement les tests visibles.
// Une spec peut répartir son contrat et ses scénarios sur plusieurs fichiers suffixés (`SPEC-XXXX.api.test.ts`,
// `SPEC-XXXX.ui.test.tsx`), par exemple quand ils s'exécutent dans des environnements différents.
// Usage :
//   node scripts/holdout.mjs hide            retire tests/holdout de ce workspace (sparse-checkout), au début de /implement et de /fix
//   node scripts/holdout.mjs list            scénarios actifs : ceux dont le test de contrat n'a plus de `.skip`
//   node scripts/holdout.mjs run [--details] joue les scénarios actifs (code 1 si l'un échoue)
// Sans `--details`, la sortie se limite à un décompte par spec : le détail d'un échec est réservé à l'humain,
// sinon l'agent qui lit la CI apprendrait le scénario. Rapport complet dans .context/holdout.json (hors git).
// Retour arrière de `hide` (humain) : git sparse-checkout disable.
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const HOLDOUT_DIR = "tests/holdout";
const ACCEPTANCE_DIR = "tests/acceptance";
// `SPEC-0003.test.ts` ou `SPEC-0003.<suffixe>.test.ts(x)`, suffixe en minuscules (ex. `api`, `ui`, `native`).
const FILE = /^(SPEC-\d{4})(?:\.([a-z][a-z0-9-]*))?\.test\.tsx?$/;
const TEST_FILE = /\.test\.tsx?$/;

/** Identifiant de spec d'un fichier de contrat ou de scénarios (`SPEC-0003.test.ts`), ou null. */
export function specOf(file) {
  return FILE.exec(path.basename(file))?.[1] ?? null;
}

/** Suffixe d'un fichier de contrat ou de scénarios (`api` pour `SPEC-0003.api.test.ts`), ou null. */
export function suffixOf(file) {
  return FILE.exec(path.basename(file))?.[2] ?? null;
}

/** Fichiers de test de `folder` (relatif à `dir`), triés ; liste vide si le dossier n'existe pas. */
function testFiles(dir, folder) {
  if (!fs.existsSync(path.join(dir, folder))) return [];
  return fs
    .readdirSync(path.join(dir, folder))
    .filter((f) => TEST_FILE.test(f))
    .sort();
}

/** Textes de tous les fichiers de contrat d'une spec, quels que soient leur suffixe et leur extension. */
function readAcceptance(dir, spec) {
  return testFiles(dir, ACCEPTANCE_DIR)
    .filter((f) => specOf(f) === spec)
    .map((f) => fs.readFileSync(path.join(dir, ACCEPTANCE_DIR, f), "utf8"));
}

/** Les scénarios d'une spec sont joués quand elle a un contrat et qu'aucun de ses fichiers n'a encore de `.skip`. */
export function isActive(acceptanceTexts) {
  return acceptanceTexts.length > 0 && acceptanceTexts.every((text) => !/\.skip\s*\(/.test(text));
}

/** Fichiers de test du contrat ou des scénarios dont le nom n'est pas reconnu : ils ne seraient jamais joués. */
export function unrecognizedFiles(dir = process.cwd()) {
  return [ACCEPTANCE_DIR, HOLDOUT_DIR].flatMap((folder) =>
    testFiles(dir, folder)
      .filter((f) => specOf(f) === null)
      .map((f) => path.join(folder, f)),
  );
}

/** Signale les noms non reconnus ; renvoie true s'il y en a. */
function reportUnrecognized() {
  const bad = unrecognizedFiles();
  for (const f of bad)
    console.error(`Nom non reconnu : ${f} (attendu SPEC-XXXX.test.ts ou SPEC-XXXX.<suffixe>.test.ts, en .ts ou .tsx)`);
  return bad.length > 0;
}

/** Décompte par spec d'un rapport JSON de Vitest : `{ spec, passed, total, failures, error }`. */
export function summarize(report) {
  return (report.testResults ?? [])
    .map((r) => {
      const tests = r.assertionResults ?? [];
      const failed = tests.filter((t) => t.status === "failed");
      return {
        spec: specOf(r.name) ?? path.basename(r.name),
        passed: tests.filter((t) => t.status === "passed").length,
        total: tests.length,
        failures: failed.map((t) => ({ title: t.fullName ?? t.title, messages: t.failureMessages ?? [] })),
        // Fichier en échec sans test en échec : erreur de chargement (import, syntaxe).
        error: r.status === "failed" && failed.length === 0 ? (r.message ?? "erreur de chargement") : null,
      };
    })
    .sort((a, b) => a.spec.localeCompare(b.spec));
}

/** Fichiers de scénarios présents dans `dir`, avec leur état d'activation. */
export function holdouts(dir = process.cwd()) {
  return testFiles(dir, HOLDOUT_DIR)
    .filter((f) => specOf(f) !== null)
    .map((f) => ({
      spec: specOf(f),
      file: path.join(HOLDOUT_DIR, f),
      active: isActive(readAcceptance(dir, specOf(f))),
    }));
}

function hide() {
  execFileSync("git", ["sparse-checkout", "set", "--no-cone", "/*", `!/${HOLDOUT_DIR}/`], { stdio: "inherit" });
  console.log(`${HOLDOUT_DIR} retiré de ce workspace (retour arrière, humain : git sparse-checkout disable).`);
  return 0;
}

function list() {
  if (reportUnrecognized()) return 2;
  const all = holdouts();
  if (!all.length) console.log("Aucun scénario caché dans ce workspace");
  for (const h of all) console.log(`${h.spec}  ${h.active ? "actif" : "inactif (test de contrat encore en .skip)"}`);
  return 0;
}

function run(details) {
  if (reportUnrecognized()) return 2;
  const active = holdouts().filter((h) => h.active);
  if (!active.length) {
    console.log("Scénarios cachés : aucun à jouer");
    return 0;
  }
  const out = path.join(".context", "holdout.json");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.rmSync(out, { force: true });
  const res = spawnSync(
    "pnpm",
    ["exec", "vitest", "run", ...active.map((h) => h.file), "--reporter=json", `--outputFile=${out}`],
    { encoding: "utf8", env: { ...process.env, HOLDOUT: "1" }, maxBuffer: 256 * 1024 * 1024 },
  );
  if (!fs.existsSync(out)) {
    console.error(`Scénarios cachés : Vitest n'a produit aucun rapport (code ${res.status ?? res.error?.message}).`);
    if (details) console.error(`${res.stdout ?? ""}${res.stderr ?? ""}`);
    return 2;
  }
  const rows = summarize(JSON.parse(fs.readFileSync(out, "utf8")));
  let failed = false;
  for (const r of rows) {
    const ok = !r.error && r.passed === r.total;
    failed ||= !ok;
    console.log(`${r.spec} : ${r.passed}/${r.total} scénarios cachés passent${r.error ? " (fichier en erreur)" : ""}`);
    if (!details) continue;
    if (r.error) console.log(`  ${r.error}`);
    for (const f of r.failures) console.log(`  ÉCHEC ${f.title}\n${f.messages.map((m) => `    ${m}`).join("\n")}`);
  }
  if (failed && !details)
    console.error(
      "Détail réservé à l'humain : node scripts/holdout.mjs run --details (voir docs/factory/WORKFLOW.md).",
    );
  return failed ? 1 : 0;
}

const isMain =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href;
if (isMain) {
  const [cmd, ...args] = process.argv.slice(2);
  try {
    if (cmd === "hide") process.exit(hide());
    else if (cmd === "list") process.exit(list());
    else if (cmd === "run") process.exit(run(args.includes("--details")));
    else {
      console.error("Usage : node scripts/holdout.mjs hide | list | run [--details]");
      process.exit(2);
    }
  } catch (e) {
    console.error(`holdout : ${e instanceof Error ? e.message : e}`);
    process.exit(2);
  }
}

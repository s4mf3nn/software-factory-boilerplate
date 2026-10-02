import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = path.resolve("scripts/review-gate.mjs");
let repos: string[] = [];

afterEach(() => {
  for (const r of repos) fs.rmSync(r, { recursive: true, force: true });
  repos = [];
});

const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_SYSTEM: "/dev/null" };
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-c", "commit.gpgsign=false", "-c", "core.hooksPath=/dev/null", ...args], {
    cwd,
    encoding: "utf8",
    env: gitEnv,
  });

/** Dépôt temporaire avec un commit sur `origin/main` et un commit de travail au-dessus. */
function newRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), "review-gate-"));
  repos.push(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.email", "t@example.com");
  git(repo, "config", "user.name", "t");
  fs.writeFileSync(path.join(repo, "a.txt"), "a");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "base");
  git(repo, "update-ref", "refs/remotes/origin/main", "HEAD");
  fs.writeFileSync(path.join(repo, "b.txt"), "b");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "work");
  return repo;
}

function gate(repo: string, ...args: string[]) {
  const res = spawnSync("node", [script, ...args], { cwd: repo, encoding: "utf8", env: gitEnv });
  return { code: res.status, out: res.stdout, err: res.stderr };
}

describe("scripts/review-gate.mjs", () => {
  it("records the reviewer model in the PR section when provided", () => {
    const repo = newRepo();
    expect(gate(repo, "record", "OK", "--loops", "2", "--model", "opus").code).toBe(0);
    const section = gate(repo, "section").out;
    expect(section).toContain("Verdict : OK");
    expect(section).toContain("Passages : 2");
    expect(section).toContain("Modèle du relecteur : opus");
    expect(gate(repo, "check").code).toBe(0);
  });

  it("adds no model line when none is provided", () => {
    const repo = newRepo();
    gate(repo, "record", "OK");
    expect(gate(repo, "section").out).not.toContain("Modèle du relecteur");
  });

  it("refuses the push when the code changed since the review or the verdict is not OK", () => {
    const repo = newRepo();
    expect(gate(repo, "check").code).toBe(1);
    gate(repo, "record", "CHANGEMENTS", "--model", "sonnet");
    expect(gate(repo, "check").err).toContain("CHANGEMENTS");
    gate(repo, "record", "OK");
    fs.writeFileSync(path.join(repo, "c.txt"), "c");
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "more");
    expect(gate(repo, "check").err).toContain("Le code a changé");
  });
});

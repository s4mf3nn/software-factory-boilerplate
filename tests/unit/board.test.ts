import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

interface Task {
  id: string;
  title: string;
  group: string;
  details: string;
}
interface Spec {
  id: string;
  dir: string;
  title: string;
  declaredStatus: string;
  tasks: Task[];
  hasPlan: boolean;
}
interface Pr {
  state: string;
  mergedAt: string | null;
  url: string;
}
interface Board {
  taskOfBranch(branch: string): string | null;
  taskStatus(prs: Pr[], current: string): string;
  specStatus(taskStatuses: string[], declaredStatus: string): string;
  taskBody(spec: Spec, task: Task, specIssueNumber: number, prUrls: string[]): string;
  specBody(spec: Spec, rows: { id: string; title: string; number: number; done: boolean }[]): string;
}
const board = (await import(pathToFileURL(path.resolve("scripts/board.mjs")).href)) as Board;

const open: Pr = { state: "OPEN", mergedAt: null, url: "u1" };
const merged: Pr = { state: "MERGED", mergedAt: "2026-01-01", url: "u2" };
const abandoned: Pr = { state: "CLOSED", mergedAt: null, url: "u3" };

describe("taskOfBranch", () => {
  it("finds the task in a plain or prefixed branch name", () => {
    expect(board.taskOfBranch("spec-0001-t2-create-link")).toBe("SPEC-0001/T2");
    expect(board.taskOfBranch("s4mf3nn/spec-0012-t10-x")).toBe("SPEC-0012/T10");
  });

  it("ignores branches that are not task branches", () => {
    expect(board.taskOfBranch("s4mf3nn/7tbb6")).toBeNull();
  });
});

describe("taskStatus", () => {
  it("is todo without a pull request", () => {
    expect(board.taskStatus([], "todo")).toBe("todo");
  });

  it("keeps in-progress until a pull request exists", () => {
    expect(board.taskStatus([], "in-progress")).toBe("in-progress");
    expect(board.taskStatus([abandoned], "in-progress")).toBe("in-progress");
  });

  it("is in-review with an open pull request", () => {
    expect(board.taskStatus([open], "in-progress")).toBe("in-review");
  });

  it("is done as soon as a pull request is merged", () => {
    expect(board.taskStatus([abandoned, merged], "todo")).toBe("done");
  });
});

describe("specStatus", () => {
  it("is done when every task is done", () => {
    expect(board.specStatus(["done", "done"], "EN COURS")).toBe("done");
  });

  it("is in-progress when at least one task has started", () => {
    expect(board.specStatus(["done", "todo"], "VALIDÉE")).toBe("in-progress");
    expect(board.specStatus(["in-review", "todo"], "VALIDÉE")).toBe("in-progress");
  });

  it("is todo when nothing has started", () => {
    expect(board.specStatus(["todo"], "VALIDÉE")).toBe("todo");
    expect(board.specStatus([], "BROUILLON")).toBe("todo");
  });

  it("uses the declared status when there is no plan", () => {
    expect(board.specStatus([], "LIVRÉE")).toBe("done");
  });
});

describe("issue bodies", () => {
  const task: Task = { id: "T1", title: "Create", group: "Groupe 1 (parallèle)", details: "- Périmètre : src/a.ts" };
  const spec: Spec = {
    id: "SPEC-0001",
    dir: "SPEC-0001-links",
    title: "Links",
    declaredStatus: "VALIDÉE",
    tasks: [task],
    hasPlan: true,
  };

  it("tags the task issue with a stable marker and links the spec issue", () => {
    const body = board.taskBody(spec, task, 7, ["https://example.test/pr/1"]);
    expect(body).toContain("<!-- factory-id: SPEC-0001/T1 -->");
    expect(body).toContain("#7");
    expect(body).toContain("- Périmètre : src/a.ts");
    expect(body).toContain("https://example.test/pr/1");
  });

  it("lists tasks as a checklist in the spec issue", () => {
    const body = board.specBody(spec, [{ id: "T1", title: "Create", number: 8, done: true }]);
    expect(body).toContain("<!-- factory-id: SPEC-0001 -->");
    expect(body).toContain("- [x] #8 T1 : Create");
  });

  it("points to /plan when the spec has no plan yet", () => {
    expect(board.specBody({ ...spec, hasPlan: false, tasks: [] }, [])).toContain("/plan SPEC-0001");
  });
});

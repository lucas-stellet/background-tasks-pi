import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTaskTreeWidgetLines } from "./task-tree-widget.ts";

function t(overrides: Record<string, any> = {}): any {
  return {
    id: "task-1",
    type: "background",
    status: "completed",
    name: "build",
    command: "npm test",
    createdAt: "2026-05-03T00:00:00.000Z",
    completedAt: "2026-05-03T00:00:03.000Z",
    exitCode: 0,
    duration: 3000,
    resultSeen: false,
    resultPath: ".background-tasks/task-1/result.md",
    ...overrides,
  };
}

describe("task tree widget", () => {
  it("renders unseen completed and failed tasks as a background tree", () => {
    const lines = buildTaskTreeWidgetLines([
      t({ id: "task-ok", name: "ok", status: "completed", exitCode: 0 }),
      t({ id: "task-fail", name: "fail", status: "failed", exitCode: 7, error: "exit code 7" }),
    ]);

    assert.match(lines.join("\n"), /background task results \(2\).*background/);
    assert.match(lines.join("\n"), /├─ ✓ ok · exit 0 · 3\.0s/);
    assert.match(lines.join("\n"), /└─ ✗ fail · exit code 7 · 3\.0s/);
  });

  it("renders recurring tasks in the background tree with a flow glyph", () => {
    const lines = buildTaskTreeWidgetLines([
      t({ id: "task-watch", type: "recurring", status: "recurring", name: "watch", interval: 10, stdout: "tick" }),
    ]);

    assert.match(lines.join("\n"), /background task result.*background/);
    assert.match(lines.join("\n"), /└─ ↻ watch · recurring every 10s/);
    assert.match(lines.join("\n"), /⎿  task-watch · tick/);
  });

  it("excludes active, cancelled, and seen terminal tasks", () => {
    assert.deepEqual(buildTaskTreeWidgetLines([
      t({ status: "running", resultSeen: false }),
      t({ status: "cancelled", resultSeen: false }),
      t({ status: "completed", resultSeen: true }),
      t({ status: "failed", resultSeen: true }),
    ]), []);
  });
});

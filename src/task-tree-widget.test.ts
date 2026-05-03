import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildTaskTreeWidgetLines, createTaskTreeWidget } from "./task-tree-widget.ts";

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

  it("renders recurring tasks in the background tree without output preview lines", () => {
    const lines = buildTaskTreeWidgetLines([
      t({
        id: "task-watch",
        type: "recurring",
        status: "recurring",
        name: "watch",
        interval: 10,
        stdout: "old\nmid\ntick",
        lastOutputAt: "2026-05-03T00:00:05.000Z",
      }),
    ], {}, 120, new Date("2026-05-03T00:00:12.000Z").getTime());

    const text = lines.join("\n");
    assert.match(text, /background task result.*background/);
    assert.match(text, /└─ [⟳↻↺] watch · recurring every 10s · active 7s ago/);
    assert.doesNotMatch(text, /old/);
    assert.doesNotMatch(text, /mid/);
    assert.doesNotMatch(text, /tick/);
    assert.doesNotMatch(text, /⎿/);
  });

  it("animates recurring task glyphs on each one-second tree refresh", () => {
    const task = t({
      id: "task-watch",
      type: "recurring",
      status: "recurring",
      name: "watch",
      interval: 10,
    });

    const first = buildTaskTreeWidgetLines([task], {}, 120, 0).join("\n");
    const second = buildTaskTreeWidgetLines([task], {}, 120, 1000).join("\n");
    const third = buildTaskTreeWidgetLines([task], {}, 120, 2000).join("\n");

    assert.match(first, /└─ ⟳ watch · recurring every 10s/);
    assert.match(second, /└─ ↻ watch · recurring every 10s/);
    assert.match(third, /└─ ↺ watch · recurring every 10s/);
  });

  it("renders running tasks with a spinner and activity but without output preview lines", () => {
    const lines = buildTaskTreeWidgetLines([
      t({
        id: "task-run",
        status: "running",
        name: "long build",
        stdout: "one\ntwo\nthree\nfour",
        lastOutputAt: "2026-05-03T00:00:10.000Z",
      }),
    ], {}, 120, new Date("2026-05-03T00:00:12.000Z").getTime());

    const text = lines.join("\n");
    assert.match(text, /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏] long build · running · active 2s ago/);
    assert.doesNotMatch(text, /one/);
    assert.doesNotMatch(text, /two/);
    assert.doesNotMatch(text, /three/);
    assert.doesNotMatch(text, /four/);
    assert.doesNotMatch(text, /⎿/);
  });

  it("excludes cancelled and seen terminal tasks", () => {
    assert.deepEqual(buildTaskTreeWidgetLines([
      t({ status: "cancelled", resultSeen: false }),
      t({ status: "completed", resultSeen: true }),
      t({ status: "failed", resultSeen: true }),
    ]), []);
  });

  it("keeps rendered lines within terminal width after the widget prefix", () => {
    const componentFactory = createTaskTreeWidget([
      t({
        id: "task-wide",
        status: "running",
        name: "PR-186 CI monitor and squash merge",
        stdout: "🚀".repeat(200),
        lastOutputAt: "2026-05-03T00:00:10.000Z",
      }),
    ]);
    const component = componentFactory(undefined, {});

    for (const line of component.render(40)) {
      assert.ok([...line].length <= 40, `line too long: ${line}`);
    }
  });
});

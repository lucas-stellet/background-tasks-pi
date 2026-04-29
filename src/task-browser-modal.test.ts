import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTaskBrowserState, handleTaskBrowserSearchInput, moveTaskBrowserSortColumn, setTaskBrowserPeriod, setTaskBrowserSortDirection, setTaskBrowserStatus } from "./task-browser-state.ts";
import type { Task } from "./task-manager.ts";

function task(id: string, name: string, status: Task["status"], createdAt: string): Task {
  return {
    id,
    type: "background",
    status,
    name,
    command: `echo ${name}`,
    createdAt,
    resultSeen: false,
  };
}

describe("TaskBrowserModal source integration", () => {
  it("reads tasks from getTasks on each render", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /getTasks: \(\) => Task\[\]/);
    assert.match(source, /this\.getTasks\(\)/);
  });

  it("supports follow-output controls for live task details", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /followOutput = true/);
    assert.match(source, /lastDetailOutputVersion/);
    assert.match(source, /matchesKey\(data, "f"\)/);
    assert.match(source, /scroll paused/);
    assert.match(source, /following output/);
  });

  it("supports jumping to the top of task details with home", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /else if \(matchesKey\(data, "home"\)\) \{\n\s+this\.followOutput = false;\n\s+this\.detailScrollOffset = 0/);
    assert.match(source, /home top/);
  });

  it("refreshes detail follow state when task status changes without new output", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /lastDetailVersion/);
    assert.match(source, /task\.status/);
    assert.match(source, /task\.completedAt/);
    assert.match(source, /task\.exitCode/);
    assert.match(source, /task\.duration/);
    assert.match(source, /this\.followOutput && detailVersion !== this\.lastDetailVersion/);
  });

  it("keeps detail view bound to the selected task across render refreshes", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /detailTaskId/);
    assert.match(source, /this\.state\.tasks\.find\(\(task\) => task\.id === this\.detailTaskId\)/);
    assert.match(source, /this\.refreshState\(\);\n\s+const selected = this\.selectedTask\(\)/);
  });

  it("supports column sort mode in the task list", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /sortMode/);
    assert.match(source, /moveTaskBrowserSortColumn/);
    assert.match(source, /setTaskBrowserSortDirection/);
    assert.match(source, /matchesKey\(data, "left"\)/);
    assert.match(source, /matchesKey\(data, "right"\)/);
    assert.match(source, /this\.sortMode && matchesKey\(data, "return"\)/);
    assert.match(source, /this\.sortMode && matchesKey\(data, "escape"\)/);
    assert.match(source, /←→ column  enter asc\/desc  esc done/);
    assert.match(source, /sortHeader/);
  });

  it("shows only one selected-task output preview line in the list view", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /OUTPUT_SUMMARY_PREVIEW_CHARS/);
    assert.match(source, /OUTPUT_SUMMARY_PREVIEW_LINES = 1/);
    assert.match(source, /function previewOutput/);
    assert.match(source, /const lines = wrapped\.slice\(0, OUTPUT_SUMMARY_PREVIEW_LINES\)/);
    assert.match(source, /const preview = previewOutput\(output, innerW - 10\)/);
    assert.match(source, /preview\.truncated/);
  });

  it("supports slash search and period/status filter hotkeys", async () => {
    const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

    assert.match(source, /searchMode/);
    assert.match(source, /handleTaskBrowserSearchInput/);
    assert.match(source, /setTaskBrowserPeriod/);
    assert.match(source, /setTaskBrowserStatus/);
    assert.match(source, /period:/);
    assert.match(source, /search:/);
  });
});

describe("task browser state", () => {
  it("starts with persisted restrictive filters and hides tasks outside the session", () => {
    const state = createTaskBrowserState({
      tasks: [
        task("old", "old task", "completed", "2026-04-28T00:00:00.000Z"),
        task("current", "current task", "completed", "2026-04-29T00:00:00.000Z"),
      ],
      preferences: { period: "session", status: "all", query: "" },
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
    });

    assert.deepEqual(state.visibleTasks.map((t) => t.id), ["current"]);
  });

  it("updates search preferences from slash search input", () => {
    let state = createTaskBrowserState({
      tasks: [
        task("precommit", "mix precommit", "completed", "2026-04-29T00:00:00.000Z"),
        task("lint", "eslint", "completed", "2026-04-29T00:00:00.000Z"),
      ],
      preferences: { period: "session", status: "all", query: "" },
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
    });

    state = handleTaskBrowserSearchInput(state, "m");
    state = handleTaskBrowserSearchInput(state, "p");
    state = handleTaskBrowserSearchInput(state, "r");

    assert.deepEqual(state.preferences, { period: "session", status: "all", query: "mpr" });
    assert.deepEqual(state.visibleTasks.map((t) => t.id), ["precommit"]);
  });

  it("sorts visible tasks by selected column and direction", () => {
    let state = createTaskBrowserState({
      tasks: [
        { ...task("b-id", "beta", "completed", "2026-04-29T00:00:00.000Z"), duration: 2000 },
        { ...task("a-id", "alpha", "failed", "2026-04-29T00:00:00.000Z"), duration: 1000 },
      ],
      preferences: { period: "session", status: "all", query: "" },
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
      sort: { column: "name", direction: "asc" },
    });

    assert.deepEqual(state.visibleTasks.map((t) => t.id), ["a-id", "b-id"]);

    state = setTaskBrowserSortDirection(state);

    assert.deepEqual(state.sort, { column: "name", direction: "desc" });
    assert.deepEqual(state.visibleTasks.map((t) => t.id), ["b-id", "a-id"]);
  });

  it("moves the active sort column left and right", () => {
    let state = createTaskBrowserState({
      tasks: [],
      preferences: { period: "session", status: "all", query: "" },
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
      sort: { column: "name", direction: "asc" },
    });

    state = moveTaskBrowserSortColumn(state, 1);
    assert.equal(state.sort.column, "status");

    state = moveTaskBrowserSortColumn(state, -1);
    assert.equal(state.sort.column, "name");
  });

  it("cycles status and period filters", () => {
    let state = createTaskBrowserState({
      tasks: [],
      preferences: { period: "session", status: "all", query: "" },
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
    });

    state = setTaskBrowserStatus(state);
    state = setTaskBrowserPeriod(state);

    assert.equal(state.preferences.status, "active");
    assert.equal(state.preferences.period, "24h");
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createTaskBrowserState, handleTaskBrowserSearchInput, setTaskBrowserPeriod, setTaskBrowserStatus } from "./task-browser-state.ts";
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

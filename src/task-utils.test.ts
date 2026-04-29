import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterTasks, formatTaskListForAgent, markFinishedTasksSeen } from "./task-utils.ts";
import type { Task } from "./task-manager.ts";

function task(status: Task["status"], resultSeen = false): Task {
  return {
    id: `task-${status}`,
    type: "background",
    status,
    name: status,
    command: "echo ok",
    createdAt: new Date(0).toISOString(),
    resultSeen,
  };
}

describe("extension commands", () => {
  it("only exposes /tasks for the interactive task browser", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /registerCommand\("tasks"/);
    assert.doesNotMatch(source, /registerCommand\("list-tasks"/);
  });
});

describe("task utils", () => {
  it("marks completed and failed tasks as seen", () => {
    const tasks = [task("completed"), task("failed"), task("running"), task("recurring")];

    markFinishedTasksSeen(tasks);

    assert.equal(tasks[0]!.resultSeen, true);
    assert.equal(tasks[1]!.resultSeen, true);
    assert.equal(tasks[2]!.resultSeen, false);
    assert.equal(tasks[3]!.resultSeen, false);
  });

  it("filters active tasks", () => {
    const tasks = [task("completed"), task("failed"), task("running"), task("queued"), task("recurring")];

    assert.deepEqual(filterTasks(tasks, "active").map((t) => t.status), ["running", "queued", "recurring"]);
  });

  it("formats a textual task list for agent tool results", () => {
    const tasks: Task[] = [
      { ...task("running"), id: "task-1", name: "typecheck", command: "npm test", startedAt: "2026-04-29T00:00:00.000Z" },
      { ...task("completed", true), id: "task-2", name: "build", command: "npm run build", exitCode: 0, duration: 1234 },
    ];

    const text = formatTaskListForAgent(tasks);

    assert.match(text, /2 background tasks/);
    assert.match(text, /task-1/);
    assert.match(text, /typecheck/);
    assert.match(text, /running/);
    assert.match(text, /npm test/);
    assert.match(text, /task-2/);
    assert.match(text, /build/);
    assert.match(text, /completed/);
    assert.match(text, /exit 0/);
    assert.match(text, /1\.2s/);
  });
});

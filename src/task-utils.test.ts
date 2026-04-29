import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterTasks, markFinishedTasksSeen } from "./task-utils.ts";
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
});

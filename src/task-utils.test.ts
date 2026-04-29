import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { filterTasks, formatTaskListForAgent, markFinishedTasksSeen, markTerminalTaskSeen } from "./task-utils.ts";
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

  it("tells agents that background commands run from the project cwd", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /project cwd/);
    assert.match(source, /\.background-tasks/);
  });

  it("uses user messages for finished-task notifications so they wake the agent", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /status === "completed" \|\| status === "failed"/);
    assert.match(source, /sendUserMessage\(content\)/);
  });

  it("persists seen state through the task manager when task output is viewed", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /manager\.markTaskSeen\(params\.taskId\)/);
    assert.doesNotMatch(source, /markTerminalTaskSeen\(task\)/);
    assert.doesNotMatch(source, /task\.resultSeen = true/);
  });

  it("persists seen state through the task manager when task lists are viewed", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /manager\.markTasksSeen\(taskList\)/);
    assert.match(source, /manager\.markTasksSeen\(list\)/);
  });
});

describe("task utils", () => {
  it("marks completed, failed, and cancelled tasks as seen", () => {
    const tasks = [task("completed"), task("failed"), task("cancelled"), task("running"), task("recurring")];

    markFinishedTasksSeen(tasks);

    assert.equal(tasks[0]!.resultSeen, true);
    assert.equal(tasks[1]!.resultSeen, true);
    assert.equal(tasks[2]!.resultSeen, true);
    assert.equal(tasks[3]!.resultSeen, false);
    assert.equal(tasks[4]!.resultSeen, false);
  });

  it("only marks terminal tasks as seen when a task result is viewed", () => {
    const activeTasks = [task("pending"), task("queued"), task("running"), task("recurring")];
    const terminalTasks = [task("completed"), task("failed"), task("cancelled")];

    for (const activeTask of activeTasks) markTerminalTaskSeen(activeTask);
    for (const terminalTask of terminalTasks) markTerminalTaskSeen(terminalTask);

    assert.deepEqual(activeTasks.map((t) => t.resultSeen), [false, false, false, false]);
    assert.deepEqual(terminalTasks.map((t) => t.resultSeen), [true, true, true]);
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

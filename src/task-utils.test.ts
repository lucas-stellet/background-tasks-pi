import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyTaskBrowserFilters, filterTasks, formatTaskListForAgent, formatTaskStatusForAgent, markFinishedTasksSeen, markTerminalTaskSeen } from "./task-utils.ts";
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

function namedTask(id: string, name: string, status: Task["status"], command: string, createdAt: string): Task {
  return {
    id,
    type: "background",
    status,
    name,
    command,
    createdAt,
    resultSeen: false,
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

  it("uses amber custom messages that wake the agent for finished-task notifications", async () => {
    // Arrange
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    // Act / Assert
    assert.match(source, /registerMessageRenderer\("background-task"/);
    assert.match(source, /customType: "background-task"/);
    assert.match(source, /details: \{ status \}/);
    assert.match(source, /const shouldWakeAgent = status === "completed" \|\| status === "failed";/);
    assert.match(source, /pi\?\.sendMessage\(\{[\s\S]*customType: "background-task"[\s\S]*details: \{ status \},[\s\S]*\}, \{[\s\S]*deliverAs: "followUp"[\s\S]*triggerTurn: shouldWakeAgent[\s\S]*\}\);/);
    assert.doesNotMatch(source, /sendUserMessage\(content, \{ deliverAs: "followUp" \}\)/);
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

  it("loads and saves task browser preferences for the interactive modal", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /loadTaskBrowserConfig/);
    assert.match(source, /saveTaskBrowserConfig/);
    assert.match(source, /preferences: config\.taskBrowser/);
    assert.match(source, /onPreferencesChange/);
  });

  it("registers an agent tool for live background task status", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /get-background-task-status/);
    assert.match(source, /formatTaskStatusForAgent/);
    assert.match(source, /active\/running task progress/);
  });

  it("wires task browser live subscriptions with throttled renders and cleanup", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /manager\.subscribe/);
    assert.match(source, /scheduleTaskBrowserRender/);
    assert.match(source, /clearInterval\(heartbeatId\)/);
    assert.match(source, /unsubscribe\(\)/);
    assert.match(source, /getTasks: \(\) => manager\.getTasks\(\)/);
  });

  it("passes session start time to the task browser modal", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /sessionStartedAt: manager\.getSessionStartedAt\(\)/);
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

  it("filters task browser tasks to the current session by default", () => {
    const tasks = [
      namedTask("old", "old task", "completed", "npm test", "2026-04-28T23:59:59.000Z"),
      namedTask("current", "current task", "completed", "npm test", "2026-04-29T00:00:00.000Z"),
    ];

    const filtered = applyTaskBrowserFilters(tasks, { period: "session", status: "all", query: "" }, {
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
    });

    assert.deepEqual(filtered.map((t) => t.id), ["current"]);
  });

  it("filters task browser tasks by period and status", () => {
    const tasks = [
      namedTask("old-failed", "old failed", "failed", "npm test", "2026-04-20T00:00:00.000Z"),
      namedTask("recent-completed", "recent completed", "completed", "npm test", "2026-04-29T11:00:00.000Z"),
      namedTask("recent-failed", "recent failed", "failed", "npm test", "2026-04-29T11:30:00.000Z"),
    ];

    const filtered = applyTaskBrowserFilters(tasks, { period: "24h", status: "failed", query: "" }, {
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
    });

    assert.deepEqual(filtered.map((t) => t.id), ["recent-failed"]);
  });

  it("fuzzy searches task browser tasks by name, command, id, and status", () => {
    const tasks = [
      namedTask("task-precommit", "mix precommit", "completed", "mix precommit", "2026-04-29T11:00:00.000Z"),
      namedTask("task-lint", "eslint", "failed", "npm run lint", "2026-04-29T11:01:00.000Z"),
      namedTask("task-build", "build", "completed", "npm run build", "2026-04-29T11:02:00.000Z"),
    ];

    const filtered = applyTaskBrowserFilters(tasks, { period: "all", status: "all", query: "mpre" }, {
      sessionStartedAt: "2026-04-29T00:00:00.000Z",
      now: "2026-04-29T12:00:00.000Z",
    });

    assert.deepEqual(filtered.map((t) => t.id), ["task-precommit"]);
  });

  it("formats live task status with output tails for agent tool results", () => {
    const output = formatTaskStatusForAgent({
      id: "task-live",
      type: "background",
      status: "running",
      name: "precommit",
      command: "npm test",
      createdAt: "2026-04-29T00:00:00.000Z",
      startedAt: "2026-04-29T00:00:01.000Z",
      resultSeen: false,
      stdout: "line 1\nline 2\nline 3",
      stderr: "warn 1\nwarn 2",
      stdoutBytes: 20,
      stderrBytes: 12,
      outputVersion: 4,
      stdoutPath: "/tmp/stdout.txt",
      stderrPath: "/tmp/stderr.txt",
      resultPath: "/tmp/result.md",
    }, { now: "2026-04-29T00:00:06.000Z", tailLines: 2 });

    assert.match(output, /task-live \| precommit \| running \| exit - \| 5\.0s/);
    assert.match(output, /stdoutBytes: 20/);
    assert.match(output, /stderrBytes: 12/);
    assert.match(output, /outputVersion: 4/);
    assert.match(output, /stdout: \/tmp\/stdout\.txt/);
    assert.match(output, /line 2\nline 3/);
    assert.doesNotMatch(output, /line 1/);
    assert.match(output, /warn 1\nwarn 2/);
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

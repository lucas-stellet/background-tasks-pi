import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyTaskBrowserFilters, filterTasks, formatTaskListForAgent, formatTaskStatusForAgent, markFinishedTasksSeen, markTerminalTaskSeen, serializeTask, serializeTasks } from "./task-utils.ts";
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

  it("sends background task notifications with serialized task state in details", async () => {
    // Arrange
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    // Act / Assert
    assert.match(source, /registerMessageRenderer\("background-task"/);
    assert.match(source, /customType: "background-task"/);
    assert.match(source, /serializeTasks/);
    assert.match(source, /details: \{[\s\S]*status,[\s\S]*tasks/);
    assert.match(source, /const shouldWakeAgent = status === "completed" \|\| status === "failed" \|\| status === "mixed" \|\| status === "recurring";/);
    assert.match(source, /pi\?\.sendMessage\(\{[\s\S]*customType: "background-task"[\s\S]*details: \{[\s\S]*status,[\s\S]*tasks: serializeTasks\(manager\.getTasks\(\)\)[\s\S]*\},[\s\S]*\}, \{[\s\S]*deliverAs: "followUp"[\s\S]*triggerTurn: shouldWakeAgent[\s\S]*\}\);/);
    assert.doesNotMatch(source, /sendUserMessage\(content, \{ deliverAs: "followUp" \}\)/);
  });

  it("notifies on task start so dashboard bubbles appear immediately", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /onTaskStart\(task\) \{[\s\S]*queue\.notify/);
  });

  it("omits result paths and inspection guidance from finished task notifications", async () => {
    // Arrange
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    const getSummaryBody = source.match(/function getSummary\(task: Task\): string \{[\s\S]*?\n\}/)?.[0] ?? "";

    // Act / Assert
    assert.match(source, /onTaskError\(task, _error\) \{[\s\S]*queue\.notify\(getSummary\(task\), "failed"\);/);
    assert.doesNotMatch(getSummaryBody, /Inspect with get-background-task-result/);
    assert.doesNotMatch(getSummaryBody, /Result: \$\{task\.resultPath\}/);
  });

  it("supports partial result inspection to protect context", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /tailLines: Type\.Optional/);
    assert.match(source, /maxBytes: Type\.Optional/);
    assert.match(source, /formatPartialOutput/);
  });

  it("persists seen state through the task manager when task output is viewed", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /manager\.markTaskSeen\(params\.taskId\)/);
    assert.doesNotMatch(source, /markTerminalTaskSeen\(task\)/);
    assert.doesNotMatch(source, /task\.resultSeen = true/);
  });

  it("keeps unseen terminal tasks unmodified when task lists are viewed", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /manager\.markTasksSeen\(taskList\)/);
    assert.doesNotMatch(source, /manager\.markTasksSeen\(list\)/);
    assert.match(source, /onViewTask:[\s\S]*manager\.markTaskSeen\(taskId\)/);
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

  it("marks terminal tasks as seen on session_start so old results don't linger", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /pi\.on\("session_start"/);
    assert.match(source, /manager\.markAllTerminalSeen\(\)/);
  });

  it("exposes /clear-tasks to let users dismiss task results from the header", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /registerCommand\("clear-tasks"/);
    assert.match(source, /manager\.markAllTerminalSeen\(\)/);
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

  it("defaults task listing to current visible tasks only", () => {
    const tasks = [
      task("completed", true),
      task("failed", true),
      task("cancelled", false),
      task("completed", false),
      task("failed", false),
      task("running"),
      task("queued"),
      task("recurring"),
    ];

    assert.deepEqual(filterTasks(tasks, undefined).map((t) => t.status), ["completed", "failed", "running", "queued", "recurring"]);
    assert.deepEqual(filterTasks(tasks, "current").map((t) => t.status), ["completed", "failed", "running", "queued", "recurring"]);
    assert.equal(filterTasks(tasks, "all").length, 8);
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

describe("serializeTask", () => {
  it("serializes a task for wire transmission excluding internal paths", () => {
    const t: Task = {
      id: "task-wire",
      type: "background",
      status: "completed",
      name: "wire test",
      command: "npm test",
      createdAt: "2026-05-07T00:00:00.000Z",
      startedAt: "2026-05-07T00:00:01.000Z",
      completedAt: "2026-05-07T00:00:03.000Z",
      exitCode: 0,
      duration: 2345,
      error: undefined,
      interval: undefined,
      resultSeen: false,
      cwd: "/some/project",
      resultDir: "/some/project/.background-tasks/task-wire",
      stdoutPath: "/some/project/.background-tasks/task-wire/stdout.txt",
      stderrPath: "/tmp/stderr.txt",
      resultPath: "/tmp/result.md",
      metadataPath: "/tmp/task.json",
      isolatedDir: "/tmp/isolated",
      stdout: "test output\nall passed",
      stderr: undefined,
    };

    const serialized = serializeTask(t);

    assert.equal(serialized.id, "task-wire");
    assert.equal(serialized.name, "wire test");
    assert.equal(serialized.command, "npm test");
    assert.equal(serialized.type, "background");
    assert.equal(serialized.status, "completed");
    assert.equal(serialized.exitCode, 0);
    assert.equal(serialized.duration, 2345);
    assert.equal(serialized.error, undefined);
    assert.equal(serialized.interval, undefined);
    assert.equal(serialized.stdoutTail, "test output\nall passed");
    assert.equal(serialized.stderrTail, undefined);

    // Must not leak internal paths
    const keys = Object.keys(serialized);
    assert.ok(!keys.includes("cwd"), "must not include cwd");
    assert.ok(!keys.includes("resultDir"), "must not include resultDir");
    assert.ok(!keys.includes("stdoutPath"), "must not include stdoutPath");
    assert.ok(!keys.includes("stderrPath"), "must not include stderrPath");
    assert.ok(!keys.includes("resultPath"), "must not include resultPath");
    assert.ok(!keys.includes("metadataPath"), "must not include metadataPath");
    assert.ok(!keys.includes("isolatedDir"), "must not include isolatedDir");
    assert.ok(!keys.includes("resultSeen"), "must not include resultSeen");
    assert.ok(!keys.includes("stdout"), "must not include raw stdout");
    assert.ok(!keys.includes("stderr"), "must not include raw stderr");
  });

  it("truncates stdout/stderr tails to the given byte limit", () => {
    const stdout = "x".repeat(2000);
    const stderr = "y".repeat(300);
    const t: Task = {
      id: "task-tail",
      type: "background",
      status: "failed",
      name: "tail test",
      command: "run",
      createdAt: "2026-05-07T00:00:00.000Z",
      exitCode: 1,
      error: "boom",
      resultSeen: false,
      stdout,
      stderr,
    };

    const serialized = serializeTask(t, 500);

    assert.equal(serialized.stdoutTail?.length, 500);
    assert.equal(serialized.stdoutTail, "x".repeat(500));
    assert.equal(serialized.stderrTail, "y".repeat(300)); // under limit
  });

  it("handles a running recurring task", () => {
    const t: Task = {
      id: "task-recur",
      type: "recurring",
      status: "recurring",
      name: "poll",
      command: "curl localhost:3000/health",
      interval: 30,
      createdAt: "2026-05-07T00:00:00.000Z",
      startedAt: "2026-05-07T00:00:00.000Z",
      resultSeen: false,
      stdout: "OK",
    };

    const serialized = serializeTask(t);

    assert.equal(serialized.type, "recurring");
    assert.equal(serialized.status, "recurring");
    assert.equal(serialized.interval, 30);
    assert.equal(serialized.exitCode, undefined);
    assert.equal(serialized.duration, undefined);
    assert.equal(serialized.stdoutTail, "OK");
  });

  it("serializeTasks returns an array of serialized tasks", () => {
    const tasks: Task[] = [
      { id: "t1", type: "background", status: "running", name: "a", command: "cmd1", createdAt: "2026-05-07T00:00:00.000Z", resultSeen: false },
      { id: "t2", type: "background", status: "completed", name: "b", command: "cmd2", createdAt: "2026-05-07T00:00:01.000Z", duration: 1000, exitCode: 0, resultSeen: false },
    ];

    const result = serializeTasks(tasks);

    assert.equal(result.length, 2);
    assert.equal(result[0]!.id, "t1");
    assert.equal(result[0]!.status, "running");
    assert.equal(result[1]!.id, "t2");
    assert.equal(result[1]!.status, "completed");
  });

  it("serializeTasks handles empty arrays", () => {
    assert.deepEqual(serializeTasks([]), []);
  });
});

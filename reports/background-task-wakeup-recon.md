# Code Context

## Files Retrieved
1. `index.ts` (lines 1-88) - extension overview, global idle state, notifier wiring, task runner completion callbacks.
2. `index.ts` (lines 105-258) - background task tools and result/status access paths.
3. `index.ts` (lines 261-427) - command registration and `session_start`/`agent_start`/`agent_end` wake/flush behavior.
4. `src/notifier.ts` (lines 1-57) - notification queue semantics and delivery API abstraction.
5. `src/notifier.test.ts` (lines 1-134) - tests for immediate/queued/combined notification delivery.
6. `src/task-runner.ts` (lines 1-204) - process lifecycle, terminal task status, persistence, completion/error callbacks.
7. `src/task-manager.ts` (lines 1-208) - task model, state persistence, seen state, subscriptions.
8. `src/background-task-message.ts` (lines 1-118) - custom amber renderer for background task messages.
9. `src/task-utils.test.ts` (lines 39-57) - source-level test asserting finished notifications use custom messages and do not use `sendUserMessage(... followUp)`.
10. `docs/plans/2026-04-30-amber-background-task-notifications-design.md` (lines 1-29) - design note explaining the recent switch from follow-up user messages to custom session messages.

## Key Code

### Task completion -> notification path

`src/task-runner.ts` runs commands and calls terminal callbacks after persisting output:

```ts
// src/task-runner.ts lines 157-165
await persistTaskMetadata(task);
if (status === "completed") {
  callbacks.onTaskComplete(task);
} else {
  callbacks.onTaskError(task, task.error ?? "unknown error");
}
```

`index.ts` wires those callbacks to `queue.notify(...)`:

```ts
// index.ts lines 63-72
onTaskComplete(task) {
  manager.notifyTaskChanged(task);
  updateFooter();
  queue.notify(getSummary(task), "completed");
},
onTaskError(task, error) {
  manager.notifyTaskChanged(task);
  updateFooter();
  queue.notify(`${task.name}: ${error}`, "failed");
},
```

### Notification delivery implementation

The active notifier currently sends a custom display message only:

```ts
// index.ts lines 44-53
const notifier: Notifier = {
  isIdle: () => idle,
  sendMessage: (content, status) => {
    pi?.sendMessage({
      customType: "background-task",
      content,
      display: true,
      details: { status },
    });
  },
};
```

The queue delivers immediately if idle, otherwise stores until flushed:

```ts
// src/notifier.ts lines 14-22
function notify(summary: string, status: string): void {
  pending.push({ summary, status });

  if (notifier.isIdle()) {
    const n = pending.shift();
    if (n) {
      notifier.sendMessage(`🔔 ${n.summary}`, n.status);
    }
  }
}
```

Queued notifications are combined on flush:

```ts
// src/notifier.ts lines 35-47
function flushCombined(): string[] {
  if (pending.length === 0) return [];
  ...
  notifier.sendMessage(content, status);
  pending = [];
  return delivered;
}
```

### Agent idle/busy tracking and flush

```ts
// index.ts lines 409-426
pi.on("agent_start", async (_event, ctx) => {
  currentCtx = ctx;
  idle = false;
  updateFooter();
});

pi.on("agent_end", async (_event, ctx) => {
  currentCtx = ctx;
  idle = true;
  updateFooter();

  // pi still considers the agent active while agent_end listeners are running.
  // Defer finished-task wake-ups until the runtime has actually cleared activeRun,
  // and send one combined prompt so multiple completed tasks don't start
  // competing turns.
  setTimeout(() => {
    if (idle) queue.flushCombined();
  }, 0);
});
```

### Renderer registration

```ts
// index.ts lines 306-313
pi.registerMessageRenderer("background-task", (message, _options, theme) => {
  const details = message.details as { status?: string } | undefined;
  return createBackgroundTaskMessage({
    content: String(message.content ?? ""),
    status: details?.status ?? "update",
    theme,
  });
});
```

The renderer only affects UI rendering; it does not encode any wake/follow-up semantics.

### Tests that may lock in the regression

`src/task-utils.test.ts` explicitly asserts that finished-task notifications use custom messages and not follow-up user messages:

```ts
// src/task-utils.test.ts lines 46-54
assert.match(source, /registerMessageRenderer\("background-task"/);
assert.match(source, /customType: "background-task"/);
assert.match(source, /details: \{ status \}/);
assert.doesNotMatch(source, /sendUserMessage\(content, \{ deliverAs: "followUp" \}\)/);
```

The design doc says the old behavior was `pi.sendUserMessage(content, { deliverAs: "followUp" })` and the new design intentionally replaced it with `pi.sendMessage({ customType: "background-task", display: true, ... })` (`docs/plans/2026-04-30-amber-background-task-notifications-design.md` lines 7-11, 21-23).

## Architecture

1. `run-background-task` creates a `Task` via `createTaskManager` and starts it through `createTaskRunner` (`index.ts` lines 105-140).
2. `createTaskRunner` spawns `/bin/sh -c <command>`, streams output to `.background-tasks/<task-id>/stdout.txt` and `stderr.txt`, writes metadata/result files, then calls `onTaskComplete` or `onTaskError` (`src/task-runner.ts` lines 77-165).
3. Completion callbacks update manager subscribers/footer and enqueue a notification (`index.ts` lines 63-72).
4. `createNotificationQueue` either sends immediately if `idle === true`, or keeps notifications pending while an agent turn is active (`src/notifier.ts` lines 14-22).
5. `agent_start` sets `idle = false`; `agent_end` sets `idle = true` and `setTimeout(..., 0)` flushes queued messages (`index.ts` lines 409-426).
6. Delivery is via `pi.sendMessage({ customType: "background-task", display: true, details: { status } })`, and the registered renderer turns that message into an amber card (`index.ts` lines 44-53, 306-313; `src/background-task-message.ts` lines 94-118).

## Current Behavior

- If a task completes while the agent is idle, `queue.notify` immediately sends a `background-task` custom message to the UI.
- If a task completes while the agent is busy, it is queued and flushed as one combined `background-task` custom message after `agent_end`.
- The UI notification/card appears because `display: true` and `registerMessageRenderer("background-task", ...)` are in place.
- There is no current call that looks like an agent wake/follow-up trigger. The previous `sendUserMessage(..., { deliverAs: "followUp" })` path has been removed and is actively forbidden by a source test.

## Likely Root Cause / Hypotheses

1. **Most likely:** `pi.sendMessage()` creates a displayed session/custom message but does not wake/resume the agent. The old `pi.sendUserMessage(content, { deliverAs: "followUp" })` probably inserted a user/follow-up prompt that the runtime treated as attention requiring an agent turn. The recent amber notification change preserved UI delivery but dropped the wake semantics.
2. **The comments are stale/misleading:** `index.ts` lines 420-423 still refer to “wake-ups” and “prompt”, but the code now sends custom display messages, not a user follow-up prompt.
3. **Tests cover UI delivery but not runtime wake:** `src/notifier.test.ts` only asserts `sendMessage` calls and queue draining. `src/task-utils.test.ts` asserts the absence of the previous follow-up API. No test simulates/pi-verifies that a completed task resumes the agent after `agent_end`.
4. **Race still possible but secondary:** the `agent_end` `setTimeout(..., 0)` was intended to wait for pi to clear `activeRun`. If wake requires `sendUserMessage(... followUp)`, this delay is irrelevant. If there is another wake-capable custom-message option, timing may still matter, but the observed “UI appeared, agent not awoken” matches missing wake semantics more directly.

## Start Here

Open `index.ts` around lines 44-53 and 415-426 first. That is where notification delivery changed from wake-capable follow-up semantics to custom UI message delivery and where queued notifications are flushed after the agent ends.

## Pi-intercom handoff

No safe orchestrator target was available in this scouting environment, so no intercom handoff was sent.

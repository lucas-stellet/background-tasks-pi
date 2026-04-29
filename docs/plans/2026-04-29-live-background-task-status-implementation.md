# Live Background Task Status Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use tdd-execution to implement this plan task-by-task.

**Goal:** Add live task status for agents and users, backed by bounded in-memory output buffers and throttled UI refresh.

**Architecture:** Keep output files as the source of truth, while maintaining bounded per-task live previews and metadata in memory. Expose snapshots through a new agent tool and let the task browser rerender from a live task getter with follow-scroll behavior.

**Tech Stack:** TypeScript, Node test runner (`node --experimental-strip-types --test`), pi extension APIs.

---

### Task 1: Live output buffer and task metadata

**Files:**
- Modify: `src/task-manager.ts`
- Modify: `src/task-runner.ts`
- Test: `src/task-runner.test.ts`

**Test sequence:**

1. `TaskRunner updates stdout preview before task completes`
   - Arrange: create a task with a command that prints, sleeps, then prints again.
   - Act: start runner and wait until first stdout appears while status is still `running`.
   - Assert: `task.stdout` contains the first output, `stdoutBytes` is greater than zero, and `outputVersion` increased before completion.

2. `TaskRunner keeps live stdout preview bounded`
   - Arrange: create a command that prints more than the preview byte limit.
   - Act: run it to completion.
   - Assert: `task.stdout` is bounded to the preview limit/tail and `stdoutBytes` records the full output size.

3. `TaskRunner emits output change callbacks with throttling delegated to caller`
   - Arrange: runner callbacks include `onTaskOutput` spy.
   - Act: run a command that writes stdout/stderr.
   - Assert: callback fires for output chunks, not only completion.

**Acceptance criteria:** targeted tests fail first, then pass; existing task-runner tests pass.

---

### Task 2: Manager subscriptions and agent status formatting

**Files:**
- Modify: `src/task-manager.ts`
- Modify: `src/task-utils.ts`
- Modify: `index.ts`
- Test: `src/task-manager.test.ts`
- Test: `src/task-utils.test.ts`
- Test: `src/task-browser-modal.test.ts` or extension tests in same file

**Test sequence:**

1. `TaskManager subscribers receive task change notifications and can unsubscribe`
   - Arrange: subscribe listener, create/update task notification.
   - Act: notify once, unsubscribe, notify again.
   - Assert: listener sees only the first notification.

2. `formatTaskStatusForAgent returns live output tail for running task`
   - Arrange: running task with stdout/stderr, byte counts, output version.
   - Act: format by task.
   - Assert: output includes status, duration, stdout tail, stderr tail, and file paths.

3. `get-background-task-status is registered for agents`
   - Arrange: load extension with fake pi registration.
   - Act: inspect registered tools.
   - Assert: tool exists and prompt guidelines mention active/running progress.

**Acceptance criteria:** status tool can summarize active tasks and individual task details without marking active tasks as seen.

---

### Task 3: Live task browser source and follow scroll

**Files:**
- Modify: `src/task-browser-modal.ts`
- Modify: `index.ts`
- Test: `src/task-browser-modal.test.ts`

**Test sequence:**

1. `TaskBrowserModal reads tasks from getTasks on each render`
   - Arrange: construct modal with getter returning mutable task list.
   - Act: render, then add a task and render again.
   - Assert: second render includes the new task.

2. `TaskBrowserModal follows output to bottom when detail output grows`
   - Arrange: open detail for a running task with initial output.
   - Act: append output and render.
   - Assert: detail view shows newest tail.

3. `manual upward scroll pauses follow and f/end resumes it`
   - Arrange: detail view with enough output to scroll.
   - Act: press up/pageup, append output, render; then press `f` or `end`.
   - Assert: paused view does not jump; resumed view shows bottom.

4. `/tasks live render subscription is cleaned up on close`
   - Arrange: fake task manager subscription/render handle if practical.
   - Act: open and close modal path.
   - Assert: unsubscribe/clear timer called.

**Acceptance criteria:** browser updates without file polling and follow mode never fights manual scroll.

---

### Task 4: Full verification and docs

**Files:**
- Modify: `README.md`

**Test sequence:**

1. `README documents live status tool and follow-mode keys`
   - Assert manually by reading changed README.

2. Full suite
   - Run: `npm test`
   - Expected: all tests pass with clean output.

**Acceptance criteria:** docs mention `get-background-task-status`, live `/tasks`, `f`/`end` follow mode, and all tests pass.

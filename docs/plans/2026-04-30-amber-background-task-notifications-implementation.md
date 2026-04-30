# Amber Background Task Notifications Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render background task completion/failure messages as distinctive amber custom messages instead of user-looking follow-up messages.

**Architecture:** Add a small reusable TUI component for `background-task` custom messages. Register it in `index.ts`, and switch terminal notifications from `sendUserMessage` to `sendMessage` while preserving queued delivery semantics in the notification queue.

**Tech Stack:** TypeScript, Node `node:test`, pi extension API, `@mariozechner/pi-tui` custom message rendering.

---

### Task 1: RED — Specify finished task delivery and renderer

**Files:**
- Modify: `src/task-utils.test.ts`
- Create: `src/background-task-message.test.ts`

**Test Sequence:**

1. Update the existing extension command source test:

```ts
it("uses amber custom messages for finished-task notifications instead of user follow-ups", async () => {
  // Arrange
  const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

  // Act / Assert
  assert.match(source, /registerMessageRenderer\("background-task"/);
  assert.match(source, /customType: "background-task"/);
  assert.match(source, /details: \{ status \}/);
  assert.doesNotMatch(source, /sendUserMessage\(content, \{ deliverAs: "followUp" \}\)/);
});
```

2. Add renderer test:

```ts
it("renders completed task notifications with English amber title", () => {
  // Arrange
  const component = createBackgroundTaskMessage({
    content: "🔔 scout: exit 0 in 1.2s",
    status: "completed",
    theme: fakeTheme,
  });

  // Act
  const lines = component.render(80);
  const output = lines.join("\n");

  // Assert
  assert.match(output, /Background task completed/);
  assert.match(output, /\x1b\[48;2;58;37;5m/);
  assert.match(output, /\x1b\[38;2;255;232;163m/);
});
```

3. Add failed variant test:

```ts
it("renders failed task notifications with English failed title", () => {
  // Arrange
  const component = createBackgroundTaskMessage({
    content: "🔔 npm test: exit 1 in 18s",
    status: "failed",
    theme: fakeTheme,
  });

  // Act
  const output = component.render(80).join("\n");

  // Assert
  assert.match(output, /Background task failed/);
  assert.match(output, /npm test: exit 1/);
});
```

**Run:** `npm test`

**Expected RED:** tests fail because `src/background-task-message.ts` and `registerMessageRenderer("background-task")` do not exist, and `sendUserMessage` is still used.

### Task 2: GREEN — Add minimal amber renderer and delivery switch

**Files:**
- Create: `src/background-task-message.ts`
- Modify: `index.ts`

**Implementation:**
- Export `createBackgroundTaskMessage({ content, status, theme })` returning a `Component`.
- Use ANSI truecolor constants for the amber palette.
- Render a compact card with English title, border/header, and body content.
- Import and register the renderer in `index.ts`.
- Replace terminal `sendUserMessage` with `sendMessage({ customType: "background-task", content, display: true, details: { status } })`.

**Run:** `npm test`

**Expected GREEN:** all tests pass.

### Task 3: REFACTOR/verification

**Files:**
- Review: `src/background-task-message.ts`
- Review: `index.ts`

**Steps:**
- Remove duplication in renderer helper functions if needed.
- Ensure rendered lines respect width.
- Run `npm test` fresh.

**Acceptance Criteria:**
- `npm test` exits 0.
- No finished-task notification path calls `sendUserMessage`.
- English labels are present for completed and failed tasks.

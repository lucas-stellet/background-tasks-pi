# Task Browser Column Sort Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a list-view column sorting mode to `/tasks` using left/right, enter, and escape.

**Architecture:** Keep sort state in `TaskBrowserState`, separate from persisted preferences. Apply sort after existing period/status/search filters. `TaskBrowserModal` owns a temporary sort-column mode that changes footer/key behavior while active.

**Tech Stack:** TypeScript, Node test runner, pi TUI component source tests, existing task browser state helpers.

---

### Task 1: Add task browser state sorting

**Files:**
- Modify: `src/task-browser-state.ts`
- Modify/Test: `src/task-browser-modal.test.ts`

**Step 1: Write failing state tests**

Add tests under `describe("task browser state", ...)` that import new helpers/types from `src/task-browser-state.ts`:

```ts
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
```

Add a second test for moving columns:

```ts
it("moves the active sort column left and right", () => {
  let state = createTaskBrowserState({ ...baseOptions, sort: { column: "name", direction: "asc" } });
  state = moveTaskBrowserSortColumn(state, 1);
  assert.equal(state.sort.column, "status");
  state = moveTaskBrowserSortColumn(state, -1);
  assert.equal(state.sort.column, "name");
});
```

**Step 2: Run RED**

Run:

```bash
node --experimental-strip-types --test src/task-browser-modal.test.ts
```

Expected: FAIL because sort helpers/types/options do not exist.

**Step 3: Implement minimal sorting**

In `src/task-browser-state.ts`:

- Add types:

```ts
export type TaskSortColumn = "name" | "status" | "time" | "id";
export type TaskSortDirection = "asc" | "desc";
export interface TaskBrowserSort { column: TaskSortColumn; direction: TaskSortDirection; }
```

- Add `sort: TaskBrowserSort` to `TaskBrowserState`.
- Let `createTaskBrowserState` accept optional `sort`, defaulting to `{ column: "name", direction: "asc" }`.
- Sort after filtering/search.
- Add:

```ts
export function moveTaskBrowserSortColumn(state: TaskBrowserState, delta: -1 | 1): TaskBrowserState
export function setTaskBrowserSortDirection(state: TaskBrowserState): TaskBrowserState
```

**Step 4: Run GREEN**

Run the targeted test command again. Expected: PASS.

---

### Task 2: Add modal sort mode controls and header/footer updates

**Files:**
- Modify: `src/task-browser-modal.ts`
- Modify/Test: `src/task-browser-modal.test.ts`

**Step 1: Write failing source tests**

Add source-based tests asserting:

- `sortMode` state exists.
- list-view `left`/`right` enters sort mode and calls `moveTaskBrowserSortColumn`.
- while `sortMode`, `enter` calls `setTaskBrowserSortDirection`.
- while `sortMode`, `escape` exits sort mode instead of closing.
- footer includes `←→ column  enter asc/desc  esc done`.
- header includes sort direction markers for active sort column.

**Step 2: Run RED**

Run:

```bash
node --experimental-strip-types --test src/task-browser-modal.test.ts
```

Expected: FAIL because modal sort mode does not exist.

**Step 3: Implement modal controls**

In `src/task-browser-modal.ts`:

- Import `moveTaskBrowserSortColumn` and `setTaskBrowserSortDirection`.
- Add `private sortMode = false;`.
- In list view input handling:
  - If `sortMode` and `escape`, set `sortMode = false` and request render.
  - If `sortMode` and `enter`, call `updateState(setTaskBrowserSortDirection(this.state))` and request render.
  - If left/right in list view, set `sortMode = true`, move sort column, request render.
- Keep detail view behavior unchanged.
- Render table header labels with `↑`/`↓` on active sort column.
- Render sort-mode footer while active.

**Step 4: Run GREEN**

Run targeted tests. Expected: PASS.

---

### Task 3: Document and verify

**Files:**
- Modify: `README.md`

**Step 1: Update README**

Under task browser keys, document:

- `left` / `right`: enter sort mode and move active sort column.
- Sort mode footer controls: `left/right` column, `enter` asc/desc, `escape` done.

**Step 2: Run full verification**

Run in background if potentially blocking:

```bash
npm test
```

Expected: all tests pass.

**Step 3: Commit**

```bash
git add src/task-browser-state.ts src/task-browser-modal.ts src/task-browser-modal.test.ts README.md
git commit -m "feat: sort tasks by list columns"
```

Push if this repository should stay synced with GitHub:

```bash
git push
```

# Detail View Home Key Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a `home` key shortcut that jumps to the top of the background task detail view.

**Architecture:** Extend the existing detail-view keyboard handler in `src/task-browser-modal.ts`. `home` should be handled only while `screen === "detail"`, set `detailScrollOffset` to `0`, and disable `followOutput` so refreshes do not immediately jump back to the bottom.

**Tech Stack:** TypeScript, Node test runner via `npm test`.

---

### Task 1: Add failing coverage for detail-view home shortcut

**Files:**
- Modify: `src/task-browser-modal.test.ts`

**Step 1: Write the failing test**

Add an assertion to the existing source integration suite:

```ts
it("supports jumping to the top of task details with home", async () => {
  const source = await readFile(new URL("./task-browser-modal.ts", import.meta.url), "utf8");

  assert.match(source, /matchesKey\(data, "home"\)/);
  assert.match(source, /this\.followOutput = false;\n\s+this\.detailScrollOffset = 0/);
  assert.match(source, /home top/);
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- src/task-browser-modal.test.ts`
Expected: FAIL because detail-view `home` handling and footer text do not exist yet.

### Task 2: Implement detail-view home shortcut

**Files:**
- Modify: `src/task-browser-modal.ts`
- Modify: `README.md`
- Modify: `index.ts`

**Step 1: Write minimal implementation**

Inside the `if (this.screen === "detail")` key handler, add:

```ts
} else if (matchesKey(data, "home")) {
  this.followOutput = false;
  this.detailScrollOffset = 0;
```

Update the detail footer from:

```ts
renderFooter(" ↑↓ scroll  f/end follow  esc summary  q close ", width, this.theme),
```

to:

```ts
renderFooter(" ↑↓ scroll  home top  f/end follow  esc summary  q close ", width, this.theme),
```

Update docs/comments that list keybindings so detail view documents `home` as top and `end` as bottom/follow.

**Step 2: Run targeted test**

Run: `npm test -- src/task-browser-modal.test.ts`
Expected: PASS.

**Step 3: Run full test suite**

Run: `npm test`
Expected: PASS.

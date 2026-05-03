import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("background task UI publishing", () => {
  it("mounts the task tree above the input while keeping the footer status removed", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /import\s+\{\s*createTaskTreeWidget\s*\}\s+from "\.\/src\/task-tree-widget\.ts"/);
    assert.match(source, /setStatus\("background-tasks",\s*undefined\)/);
    assert.doesNotMatch(source, /setStatus\("background-tasks",\s*buildFooterText/);
    assert.match(source, /setWidget\?\.\("background-tasks",\s*createTaskTreeWidget\(tasks\)\)/);
    assert.doesNotMatch(source, /setWidget\?\.\("background-tasks",\s*undefined\)/);
  });
});

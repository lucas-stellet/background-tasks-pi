import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("background task UI publishing", () => {
  it("publishes the task tree through widget-stack while keeping the footer status removed", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.match(source, /import\s+\{\s*buildTaskTreeWidgetLines\s*\}\s+from "\.\/src\/task-tree-widget\.ts"/);
    assert.match(source, /setStatus\("background-tasks",\s*undefined\)/);
    assert.doesNotMatch(source, /setStatus\("background-tasks",\s*buildFooterText/);
    assert.doesNotMatch(source, /setWidget\?\.\("background-tasks"/);
    assert.match(source, /publishWidgetSection\(currentCtx,\s*\{/);
    assert.match(source, /path\.join\(getAgentDir\(\),\s*"widget-stack",\s*"sessions",\s*sessionId,\s*"sections"\)/);
    assert.match(source, /clearWidgetSection\(currentCtx\)/);
  });
});

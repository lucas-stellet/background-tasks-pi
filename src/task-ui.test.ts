import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

describe("background task UI publishing", () => {
  it("does not render background tasks through footer status or footer widgets", async () => {
    const source = await readFile(new URL("../index.ts", import.meta.url), "utf8");

    assert.doesNotMatch(source, /setStatus\("background-tasks",\s*buildFooterText/);
    assert.doesNotMatch(source, /setWidget\?\.\("background-tasks",\s*createTaskTreeWidget/);
    assert.match(source, /setStatus\("background-tasks",\s*undefined\)/);
    assert.match(source, /setWidget\?\.\("background-tasks",\s*undefined\)/);
  });
});

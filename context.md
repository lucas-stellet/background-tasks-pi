# Code Context — Extension Discovery Investigation

## Files Retrieved
1. `/Users/lucas/dev/projects/background-tasks-pi/package.json` (full) — project manifest, **missing `"pi"` key**
2. `~/.pi/agent/settings.json` (full) — global pi settings, lists `"git:github.com/lucas-stellet/background-tasks-pi"` as a package
3. `~/.pi/agent/git/github.com/lucas-stellet/background-tasks-pi/package.json` (full) — pi's cached clone of the repo (identical to local)
4. `~/.pi/agent/git/github.com/lucas-stellet/pi-handoff/package.json` (full) — reference extension with correct `"pi"` key
5. `/Users/lucas/dev/projects/background-tasks-pi/.pi/settings.json` (full) — local project settings, `"packages": []`

---

## Root Cause

**`package.json` is missing the `"pi"` discovery key.**

Pi locates the extension entry point via a `"pi"` → `"extensions"` array in `package.json`. Compare:

### `pi-handoff` (working) — `~/.pi/agent/git/github.com/lucas-stellet/pi-handoff/package.json`
```json
{
  "pi": {
    "extensions": [
      "./index.ts"
    ]
  }
}
```

### `background-tasks-pi` (broken) — `package.json`
```json
{
  "name": "background-tasks-pi",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "test": "..." }
  // ← NO "pi" key at all
}
```

Without `"pi": { "extensions": ["./index.ts"] }`, pi cannot locate the entry point and silently skips loading the extension.

---

## Secondary Finding — Loaded from git cache, not local path

Pi loads the extension from its **git cache** at:
```
~/.pi/agent/git/github.com/lucas-stellet/background-tasks-pi/
```
…not from `/Users/lucas/dev/projects/background-tasks-pi/`.

The global settings (`~/.pi/agent/settings.json`) registers it as:
```json
"git:github.com/lucas-stellet/background-tasks-pi"
```

The local project's `.pi/settings.json` has `"packages": []` (empty), so changes only take effect after being **pushed to GitHub** and pi refreshing its git cache.

Currently the git cache is up to date with local (both at `9311768`), so the missing `"pi"` key is the only blocking issue.

---

## Fix Required

Add to `package.json` (line 9, after `"type": "module"`):

```json
"pi": {
  "extensions": [
    "./index.ts"
  ]
}
```

Then push to `github.com/lucas-stellet/background-tasks-pi` and trigger pi to refresh (restart pi or force a package cache refresh).

---

## Verification Commands

```bash
# 1. Confirm the key is missing in both local and cached copy
cat /Users/lucas/dev/projects/background-tasks-pi/package.json | grep -A3 '"pi"'
cat ~/.pi/agent/git/github.com/lucas-stellet/background-tasks-pi/package.json | grep -A3 '"pi"'

# 2. Confirm working reference extension has the key
cat ~/.pi/agent/git/github.com/lucas-stellet/pi-handoff/package.json | grep -A5 '"pi"'

# 3. After adding the key and pushing, verify cache is updated
cd ~/.pi/agent/git/github.com/lucas-stellet/background-tasks-pi && git pull && cat package.json | grep -A5 '"pi"'
```

---

## Architecture

```
~/.pi/agent/settings.json
  └── "packages": ["git:github.com/lucas-stellet/background-tasks-pi", ...]
        └── pi clones/pulls → ~/.pi/agent/git/github.com/lucas-stellet/background-tasks-pi/
              └── reads package.json["pi"]["extensions"][0] → ./index.ts  ← MISSING
```

## Start Here

Open `package.json` (root of this repo). The fix is adding `"pi": { "extensions": ["./index.ts"] }`. Push to GitHub. Done.

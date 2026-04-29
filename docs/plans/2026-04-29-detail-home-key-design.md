# Detail View Home Key Design

## Goal

Add a `home` keyboard shortcut in the background task detail view that returns to the beginning of the rendered output.

## Design

In `src/task-browser-modal.ts`, handle `home` while `screen === "detail"`. The handler sets `followOutput = false` and `detailScrollOffset = 0`, matching the existing behavior where upward manual scrolling pauses follow mode.

`end` keeps its current behavior: resume following live output and jump to the newest tail on render. This gives detail view symmetric navigation: `home` for top, `end` for bottom/follow.

## User-facing text

Update the detail footer/status text so users can discover the new shortcut.

## Testing

Add source-level integration assertions in `src/task-browser-modal.test.ts` to verify the detail view handles `home`, resets the scroll offset to zero, pauses follow mode, and advertises the shortcut.

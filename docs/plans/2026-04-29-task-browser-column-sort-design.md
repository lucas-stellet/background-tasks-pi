# Task Browser Column Sort Design

## Goal

Add a lightweight column-sorting mode to the `/tasks` list view. Users should be able to choose which list column controls ordering, toggle ascending/descending order, and return to normal list navigation without leaving the browser.

## Interaction

In list view, left/right arrow keys enter sort-column mode and move the active sort column across the visible columns: `name`, `status`, `time`, and `id`.

While sort-column mode is active:

- `left` / `right` moves between sortable columns.
- `enter` toggles the active column between ascending and descending order.
- `escape` exits sort-column mode and returns to normal list controls.
- The normal `enter` behavior for opening task details is suspended.
- The footer changes to show only sort-mode controls.

The list remains sorted by the selected column and direction after leaving sort-column mode.

## Display

The table header should indicate the active sort column and direction, using a compact marker such as `↑` or `↓` next to the column name. The footer should change from the normal list shortcuts to a sort-mode hint, for example:

```text
←→ column  enter asc/desc  esc done
```

## State and data flow

Sorting belongs to task browser UI state, alongside period/status/query preferences. The selected sort column and direction should be applied after period/status/search filtering, so sorting affects exactly the visible task list.

The first implementation can keep sort state in memory for the current browser session. Persisting sort preferences can be added later if needed.

## Testing

Use TDD. Add tests that drive the expected behavior before implementation:

- Source or state tests should verify sort column and direction state exists.
- State tests should verify visible tasks sort by name/status/time/id in both directions.
- Modal source tests should verify left/right enter sort mode, enter toggles direction in sort mode, escape exits sort mode, and the footer switches to sort-mode controls.

## Constraints

- Do not change detail-view follow-output behavior.
- Do not change existing `/tasks` filters or search behavior.
- Do not add polling or new persistence for task output.
- Keep keybindings simple and avoid conflicting with detail-view scrolling.

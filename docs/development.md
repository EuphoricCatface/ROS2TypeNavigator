# Development notes

This is a retrospective of the design and implementation work on September 20, 2026. Git was initialized after the first implementation had been tested, so the first commit captures that working state rather than recreating the earlier edit-by-edit history.

## Architecture decisions

The original idea was a GitHub Pages app that fetched and parsed official ROS documentation. A direct request to the Humble `CancelGoal` page returned HTTP 200 without an `Access-Control-Allow-Origin` header. Browser JavaScript on a different origin could not read that response.

Server-side fetching, prebuilt documentation snapshots, and a proxy were considered. The project owner's preference was to avoid backend and crawling infrastructure. The extension instead reads the already loaded documentation page and navigates using ordinary links. The popup constructs official URLs without fetching package catalogs.

The extension preserves the original Source block and adds a compact linked definition below it. The popup defaults to `rolling` and `msg`, and remembers submitted values locally. Go navigates the current tab on left click or Enter, and creates a background tab on middle click. Firefox and Chrome local installs are the delivery target; store publication and signing are deferred.

See [design.md](design.md) for the current behavior, supported URLs, and parsing scope.

## Findings preserved in the implementation

- **Type extraction:** A greedy match through the last whitespace can consume field names, comments, and defaults. Parse the first declaration token, recognize bounded strings and array suffixes, and preserve literal contents.
- **Service references:** A field in a service still refers to a message. For example, `CancelGoal` must link `GoalInfo` to `action_msgs/msg/GoalInfo`, keeping the current distro.
- **Source extraction:** Syntax-highlighting spans split the HTML into pieces. Read the associated code block's `textContent`, and keep the original block intact. Missing or ambiguous source blocks leave the page unchanged.
- **Popup lifetime:** Current-tab navigation can close a toolbar popup, so save submitted values before updating its URL. Middle-click navigation creates a background tab, saves after creation succeeds, then closes the popup. A storage failure must not block navigation. Separate message/service Name drafts live only in the popup's memory.
- **Narrow permissions:** An extension page opened as a normal tab does not itself grant the toolbar's `activeTab` permission. Browser automation verifies the created tab through the debugging protocol rather than adding broad permissions to the extension.
- **Firefox automation:** Direct BiDi navigation and screenshots of extension pages have restrictions. The test driver uses a disposable browser profile and privileged access to its own test window to open the installed popup page. These privileges belong to the test driver, not the shipped extension.
- **Live-site availability:** An automated Chromium request received an Anubis Access Denied page. Firefox successfully loaded and enhanced the live Humble `CancelGoal` and `PointCloud2` pages. Fixture checks and live checks are reported separately.

Tests cover the parser, routing, popup lifecycle, DOM behavior, and installed-extension navigation. [README.md](../README.md#development-and-tests) contains the commands and validation record. No browser profiles, generated screenshots, or machine-specific logs are committed.

## Repository history

- `c059695` — Initial snapshot of the working extension, tests, design, and original standalone prototype, with GPL-3.0-or-later licensing.
- The following cleanup commit moves the design into `docs/`, adds this retrospective and source license notices, and removes the retired prototype from the working tree.

To inspect the original prototype without changing your checkout:

```sh
git ls-tree -r c059695 -- app/
git show c059695:app/app.js
git show c059695:app/index.html
```

For subsequent work, make commits at meaningful milestones. Explain the problem, resulting behavior, and relevant validation in commit messages. Add regression tests for behavioral fixes and update these notes when an architectural decision or debugging discovery will help future maintenance.

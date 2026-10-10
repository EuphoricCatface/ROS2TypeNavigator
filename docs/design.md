# Behavior reference

ROS2 Type Navigator adds linked definitions to official ROS 2 documentation and provides a toolbar navigator. Both operate on already loaded pages or construct documentation URLs; neither fetches documentation or package catalogs.

## Supported URLs

Interface pages use:

```text
https://docs.ros.org/en/<distro>/p/<pkg>/<type>/<name>.html
```

`type` is `msg`, `srv`, or `action`. Package pages end at `<pkg>/`; distribution listings end at `/p/`. Query strings and fragments do not affect recognition. Other hosts and documentation layouts are unsupported.

All generated URLs use HTTPS and the official `docs.ros.org` host.

## Page enhancement

The content script looks inside `main` or `[role="main"]` for a Source label followed by a single `pre` or syntax-highlighted code block. Heading permalinks are ignored when matching the label. Missing or ambiguous candidates leave the page unchanged.

A **Navigable definition** section is inserted immediately after the Source block. The original block is preserved, and repeated enhancement never adds a duplicate section. The added definition removes comments and blank lines, normalizes declaration spacing, and preserves field order, constants, defaults, and bounds. Quoted strings and escapes retain their contents.

| Interface | Sections |
| --- | --- |
| Message | One unlabeled definition |
| Service | Request, Response |
| Action | Goal, Result, Feedback |

Services require one `---` separator; actions require two. Empty sections display `(empty)`. A malformed section layout remains a single unlinked block rather than receiving guessed boundaries.

The reformatting toggle defaults to enabled. Changing it adds or removes the extension section across open documentation tabs through local storage notifications. A newer notification takes precedence over a pending initial preference read. Turning reformatting off leaves the original Source block and popup navigation available.

## Declaration parsing

The first whitespace-delimited token is the field type. Supported array suffixes are `[]`, `[N]`, and `[<=N]`, with positive integer bounds. Bounded `string<=N` and `wstring<=N` are also recognized.

Primitive types remain unlinked: `bool`, `byte`, `char`, `float32`, `float64`, `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `string`, and `wstring`.

For message references, `pkg/Name` resolves against the named package; an unqualified `Name` resolves against the current package. Links always target `msg` in the current distribution, including fields inside services and actions. Only the base type is linked; array suffixes remain visible.

| Declaration | Result |
| --- | --- |
| `geometry_msgs/Pose pose` | Link to `geometry_msgs/msg/Pose` |
| `GoalInfo[] goals_canceling` in `action_msgs` | Link to `action_msgs/msg/GoalInfo`, retaining `[]` |
| `Point[<=10] points` in `geometry_msgs` | Link to `geometry_msgs/msg/Point`, retaining `[<=10]` |
| `string<=32 label` | Retain the bound; no link |
| `int32 count 10` | Retain the default; no link |
| `uint8 MODE = 1` | Render `uint8 MODE=1`; no link |

Field names follow lowercase snake case; constant names follow uppercase snake case. Primitive defaults are retained. Unsupported syntax, including complex defaults and standalone IDL declarations, remains plain text without speculative links. Rendering uses DOM text nodes and anchors, never source-derived HTML.

## Popup navigation

On supported ROS pages, the popup prefills from the current URL. Elsewhere, it restores valid saved values or starts with `rolling`, `msg`, and empty Package and Name fields. Package and distribution pages leave the more specific fields empty and select `msg`.

Inputs are trimmed before validation:

| Field | Accepted values |
| --- | --- |
| Distro | `[a-z][a-z0-9_]*`; empty uses `rolling` |
| Package | `[a-z][a-z0-9_]*`, or empty |
| Type | `msg`, `srv`, or `action` |
| Name | `[A-Z][A-Za-z0-9]*`, or empty; requires Package when supplied |

| Supplied fields | Destination |
| --- | --- |
| Distro only | Distribution package listing |
| Distro + Package | Package documentation |
| Distro + Package + Type + Name | Interface definition |

Type has no effect when Name is empty. Distribution suggestions are optional; valid unlisted names are accepted.

Package and Name placeholders change with Type: `visualization_msgs/msg/Marker`, `nav_msgs/srv/SetMap`, and `control_msgs/action/FollowJointTrajectory`. Examples are prefixed with `ex:`. Switching Type preserves Package and swaps between independent Name drafts; only the initially selected type inherits the prefilled Name. Drafts are discarded when the popup closes.

Left click Go or Enter navigates the current tab. Middle click creates a background tab. Both paths validate input and close the popup on success; right click does not navigate. Invalid fields receive an inline error and focus, and simultaneous submissions cannot open multiple tabs.

## State and failure handling

| Local storage key | Value |
| --- | --- |
| `lastNavigation` | One submitted set of distro, package, type, and name |
| `reformatEnabled` | Boolean; absent means enabled |

Current-tab navigation saves values before updating the URL because navigation can close the popup. A failed update leaves the popup open with an error, but values may already be saved. Middle-click navigation creates the tab before saving; failed creation leaves saved values unchanged. Storage failures do not prevent navigation.

Missing destinations and access challenges are handled by the official website. The extension does not check link existence, bypass site restrictions, or switch distributions automatically.

The Manifest V3 extension uses `activeTab`, `storage`, and a content script scoped to `https://docs.ros.org/en/*`. Private/incognito access is disabled with `incognito: "not_allowed"`. There is no background worker or remote extension code. See [PRIVACY.md](../PRIVACY.md) for data disclosures and [the contributor guide](development.md) for validation commands.

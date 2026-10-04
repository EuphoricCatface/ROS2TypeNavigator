# ROS2 Type Navigator - Extension Design

## Motivation

ROS documentation pages can be difficult to browse when message field types do not link to their definitions. Search results also often lead users to older documentation.

This project improves browsing by adding navigable type links to the official pages the user visits. A small toolbar popup provides direct navigation to a distro, package, or interface. Changes made by the extension are local to the user's browser; improving search rankings is outside this version's scope.

## Target and scope

- A Firefox and Chrome extension using plain JavaScript, HTML, CSS, and a JSON manifest.
- Automatic enhancement of current rosdoc2 message and service pages on `https://docs.ros.org/`.
- A toolbar navigator available even when the current tab is not a ROS page.
- No hosted backend, proxy, crawler, documentation mirror, scheduled jobs, or runtime downloads of extension code.
- No framework or compilation step required. Browser-specific packaging is allowed.
- Actions, standalone IDL definitions, and pre-rosdoc2 documentation are outside the initial scope.

The earlier standalone website prototype is preserved under `app/` in the initial Git commit (`c059695`). The extension replaces that prototype; its query-string routing is not the extension's API.

## Official URLs

The initial supported interface URL shape is:

`https://docs.ros.org/en/<distro>/p/<pkg>/<type>/<name>.html`

Here, `type` is `msg` or `srv`. Examples:

- https://docs.ros.org/en/rolling/p/point_cloud_interfaces/msg/CompressedPointCloud2.html
- https://docs.ros.org/en/humble/p/action_msgs/srv/CancelGoal.html

The distro package listing is `https://docs.ros.org/en/<distro>/p/`, and a package landing page is `https://docs.ros.org/en/<distro>/p/<pkg>/`.

All generated links target official documentation. There is no extension-specific query-string API. Other URL layouts, including older documentation aliases, are not promised in the initial version.

## Automatic page enhancement

After a supported interface page loads, a content script:

1. Reads distro, package, interface kind, and name from the current URL.
2. Locates the main interface's `Source` code block and reads its text, preserving line breaks across syntax-highlighting elements.
3. Leaves the original source block available with its existing formatting and comments.
4. Adds a section immediately after it, titled `Navigable definition`, containing a compact definition with linked message types.

The added section preserves declaration order, field names, constants, default values, and array/string bounds. It removes comments and blank lines, trims indentation, and normalizes spacing between declaration tokens without changing literal values. Comment recognition must respect quoted strings and escapes. Primitive declarations remain visible but unlinked.

Services retain their request/response boundary, displayed with `Request` and `Response` labels. Empty messages and empty request or response sections are valid; display `(empty)` for them.

Links behave as ordinary hyperlinks, including keyboard navigation, opening in a new tab, and browser Back. Following a link loads the next official page, where the extension runs again. No target prefetching or link-existence checks are needed.

Insert at most one extension section per document. Use scoped styles and native links so that the additions work with the official page's typography and colors.

## Type recognition and link resolution

Parse each declaration's first whitespace-delimited token as its type; do not capture through the last whitespace on the line. Blank lines, comments, and the service separator are not declarations.

For link resolution only:

1. Remove any array suffix: `[]`, `[N]`, or `[<=N]`.
2. Recognize bounded strings such as `string<=32` as primitive types.
3. Treat `bool`, `byte`, `char`, `float32`, `float64`, `int8`, `int16`, `int32`, `int64`, `uint8`, `uint16`, `uint32`, `uint64`, `string`, and `wstring` as primitives; bounded `wstring` is also primitive.
4. Resolve `pkg/Name` against the named package and an unqualified `Name` against the current package.
5. Preserve the current distro and always target `msg`, even when the containing document is a service.

Only the base message type is linked; array bounds remain visible after the link. Examples:

| Source declaration | Link destination |
| --- | --- |
| `geometry_msgs/Pose pose # current pose` | Current distro, `geometry_msgs/msg/Pose` |
| `GoalInfo[] goals_canceling` in `action_msgs/srv/CancelGoal` | Current distro, `action_msgs/msg/GoalInfo`; display `[]` after the link |
| `Point[<=10] points` in `geometry_msgs` | Current distro, `geometry_msgs/msg/Point`; display `[<=10]` after the link |
| `int32 count 10` | None; retain the declaration and default |
| `string<=32 label` | None; retain the bound |
| `uint8 MODE=1` | None; retain the constant |

Unknown or unsupported declaration syntax remains visible as plain text rather than receiving a guessed link. Build displayed text and links using DOM APIs, rather than inserting source text as HTML.

## Toolbar navigator

Clicking the extension's toolbar button opens a small popup with:

- **Distro:** text input with a `datalist` of known distro names, including `rolling`. Unlisted syntactically valid names are accepted.
- **Package:** text input.
- **Type:** `select` with `msg` and `srv`; initially `msg`.
- **Name:** text input, preserving case.
- **Go:** submit button; Enter also submits.

Package and Name placeholders show examples for the selected Type: `visualization_msgs/msg/Marker` for messages and `nav_msgs/srv/SetMap` for services. Apply them when initializing the popup and whenever Type changes. Keep examples prefixed with `ex:`. Changing Type preserves Package and swaps between separate in-memory Name drafts. Initialize the selected type's draft from the prefilled Name and the other draft as empty; discard both when the popup closes.

When opened on a supported ROS URL, populate the available fields from that URL. On a package or distro listing, leave the more specific fields blank and select `msg`. On other pages, restore the last submitted values, or start with `rolling`, an empty package/name, and `msg` if there are none. `rolling` is the confirmed initial default; it is an explicit setting rather than an automatically discovered latest release.

Trim surrounding whitespace on submission. An empty distro resolves to the initial default. Require distro and package values to match `[a-z][a-z0-9_]*`, and interface names to match `[A-Z][A-Za-z0-9]*`, matching each whole value. Validate `type` as `msg` or `srv` even though the normal control is a select. Reject invalid input in the popup before navigation.

| Submitted fields after applying the distro default | Destination |
| --- | --- |
| Distro, no package or name | Official distro package listing |
| Distro and package, no name | Official package landing page |
| Distro, package, type, and name | Official interface page |
| Name without package | Inline validation error |

The selected type does not affect the destination when name is empty. This version uses the official listing pages rather than downloading package/interface lists into the popup.

Left click Go or press Enter to navigate the current tab. Middle click Go to open a new background tab. Both paths validate the inputs and close the popup on success; right click does not navigate. Inputs have visible labels; validation errors explain which field needs correction.

Current-tab navigation can tear down the popup, so save valid submitted values locally before navigating. If navigation fails, leave the popup open with an error; the submitted values may already be saved. For middle click, create the background tab first, then save and close. Failed tab creation leaves saved values unchanged. Storage failure must not prevent either navigation path. No separate Name drafts are persisted.

## Extension structure and permissions

Use a Manifest V3 content-script declaration restricted to `https://docs.ros.org/en/*`; the script checks the supported interface URL shape before modifying anything. Use the extension action's popup for navigation.

The implementation needs local storage for submitted values and access to the active tab URL for prefilling the popup. Prefer `storage` and `activeTab` alongside the scoped content-script declaration; avoid broad access to unrelated websites. Account for Firefox and Chrome permission behavior during packaging and testing.

Neither the content script nor the popup fetches documentation. The browser loads destinations through normal navigation. No background process is required for the initial behavior, and ROS CORS headers do not affect reading the already loaded page.

## Error handling

- Invalid popup inputs produce a short inline error and do not navigate.
- Unsupported pages are left untouched.
- A matching interface URL without a recognizable Source block is left readable. Do not insert a definition or assume a server-side cause. Diagnostics may be logged to the extension console.
- A declaration that cannot be understood is retained as plain text in the added section.
- Missing destination pages, server errors, or access challenges are shown by the official site. Do not infer that they are temporary or switch distros silently.
- If the browser denies site access, automatic enhancement cannot run; the navigator can still construct official URLs.

## Acceptance checks

The first delivery supports local installation in both browsers. Store submission and signing are deferred. Firefox's temporary development installation must be repeated after a browser restart.

Verify in both Firefox and Chrome:

- A message with cross-package references receives correct links without changing its source block.
- `CancelGoal` links same-package `GoalInfo` references to `msg`, and retains its request/response split.
- Fixed and bounded arrays, bounded strings, defaults, constants, comments, and empty definitions display correctly.
- Re-running enhancement does not duplicate the section; unsupported syntax stays visible.
- Popup prefill works on interface, package, and distro pages, and saved values work on unrelated pages.
- All popup navigation states and validation errors follow the table above.
- Following a type link, opening it in a new tab, and using Back work normally.
- Missing Source blocks and unavailable destination pages do not break the original documentation.
- The extension issues no documentation fetches or background crawling requests.

## References

- [Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- [Extension popups](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/user_interface/Popups)
- [ROS interface format](https://design.ros2.org/articles/legacy_interface_definition.html)

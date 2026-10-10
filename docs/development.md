# Contributing

The extension is plain JavaScript, HTML, and CSS with no build step or npm dependencies. Load `extension/` using the [README instructions](../README.md#install-from-source). After editing runtime files, reload the extension in the browser's extension manager and reload affected documentation tabs.

## Code layout

| File or directory | Purpose |
| --- | --- |
| [extension/core.js](../extension/core.js) | URL routing, input validation, and definition parsing; shared by the popup and content script |
| [extension/content.js](../extension/content.js) | Source-block discovery, DOM rendering, and reformatting preference updates |
| [extension/popup.js](../extension/popup.js) | Navigation, local storage, and popup interactions |
| `extension/*.html`, `extension/*.css` | Popup markup and scoped styles |
| [extension/manifest.json](../extension/manifest.json) | Permissions, browser compatibility, and extension metadata |
| [tests/](../tests/) | Unit tests, browser harness, and documentation fixtures |
| [script/](../script/) | Local checks and release packaging |
| [assets/](../assets/README.md) | Artwork sources and rendering instructions |

Keep routing and parsing in `core.js` so they can be tested without a browser. Render source text through DOM APIs; documentation content must never become executable HTML. Preserve the original Source block and keep injected styles scoped to the added section.

The [behavior reference](design.md) describes parsing rules, popup state, and storage. Update it when changing those contracts, and update [PRIVACY.md](../PRIVACY.md) when changing data handling.

## Local checks

Requires Node.js 22.8+ and Python 3:

```sh
./script/test.mjs
```

This runs unit tests, parses JavaScript and Python for syntax errors, and validates the manifest and referenced resources. Validation covers icon dimensions, popup dependencies, permissions, and the private-window restriction.

## Browser tests

With `chromium` and/or `firefox` on your PATH:

```sh
node tests/run-browser-tests.mjs chromium
node tests/run-browser-tests.mjs firefox
```

The runner loads the extension into a disposable profile and tests DOM rendering, popup validation, name drafts, reformatting, navigation, and local storage against fixtures. It uses local debugging sockets and writes screenshots to the system temporary directory. Firefox automation uses privileged access to its disposable test window to open extension pages.

Add `--live` to also check actual ROS documentation:

```sh
node tests/run-browser-tests.mjs firefox --live
```

Live checks depend on the ROS site's availability and access controls; fixtures keep ordinary browser tests independent of the site.

For an interactive harness, run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Then open [the browser harness](http://127.0.0.1:8000/tests/browser.html).

## Release packages

Update `version` in `extension/manifest.json`, then run:

```sh
./script/package.py
```

Packaging runs the local checks and creates:

- `dist/ros2-type-navigator-<version>-firefox.zip`
- `dist/ros2-type-navigator-<version>-chrome.zip`

Each ZIP contains a root-level manifest, runtime resources, LICENSE, and PRIVACY.md. Firefox retains its Gecko settings; Chrome omits them. Developer tools, fixtures, screenshots, and promotional artwork are excluded. Fixed timestamps and file modes make packages reproducible with the same inputs and tools. Packaging does not sign or publish a release.

Before releasing, run the browser tests and check the real toolbar popup in each target browser: keyboard navigation, light/dark appearance, site access, and message/service/action pages. Refresh [screenshots](screenshot/) and [promotional artwork](../assets/README.md) when the UI changes.

# ROS2 Type Navigator privacy policy

Effective date: October 4, 2026

ROS2 Type Navigator is a browser extension maintained by Seongyong Park. It adds navigable interface definitions to official ROS 2 documentation and provides a popup for opening documentation pages.

## Information used locally

When you open the popup, the extension reads the current tab's URL to prefill the navigation fields if it recognizes a supported ROS documentation URL. It does not record your browsing history or store the full tab URL.

On supported pages at `https://docs.ros.org/en/*`, the extension reads the already loaded interface definition and page URL to add links to referenced message types. This processing happens in your browser; the extension does not upload the page contents.

The popup uses the distro, package, interface type (`msg` or `srv`), and interface name you enter to construct an official documentation URL. Separate message and service Name drafts remain only in memory while the popup is open and are discarded when it closes.

## Local storage and retention

The extension cannot be enabled in private or incognito windows, so it does not read or save navigation values from those windows.

The extension stores one set of submitted navigation values—distro, package, type, and name—in the browser's local extension storage so it can restore them next time. These values are not synced through the browser's sync service or sent to the maintainer.

It also stores your reformatting preference (enabled or disabled) locally. Changing this setting updates the added definitions in open documentation tabs without sending information to a server.

For navigation in the current tab, the values are saved before navigation because navigating can close the popup. They may therefore remain saved even if navigation fails. For a new background tab, values are saved after the tab is created successfully. Unsubmitted edits and the separate Name drafts are not saved.

Saved values remain until replaced by another submission or removed from the browser's extension storage. You can replace them by submitting different values, or remove them by uninstalling the extension. Disabling the extension does not erase its saved values.

## Network activity and sharing

The extension has no analytics, advertising, telemetry, remote error reporting, or developer-operated backend. It does not sell user data or transmit locally processed URLs, page contents, or saved navigation values to the maintainer or analytics services.

When you use Go or follow a documentation link, your browser visits `https://docs.ros.org/`. The destination URL includes the selected documentation path. As with any website visit, the website receives ordinary browser requests, including your IP address and browser-supplied information such as request headers and any applicable cookies. The website's own privacy practices apply to those visits. The extension does not make additional background requests to fetch documentation or package lists.

## Permissions

- **`activeTab`:** allows the popup to read the current tab's URL when you invoke the extension, for prefilling navigation fields.
- **`storage`:** allows the extension to remember submitted navigation values locally.
- **Access to `https://docs.ros.org/en/*`:** allows the content script to read supported interface definitions and insert navigable links into those pages.

## Policy updates and contact

This policy will be updated if the extension's data handling changes. The effective date above identifies the latest revision.

For privacy questions, contact Seongyong Park at [EuphoricCatface@gmail.com](mailto:EuphoricCatface@gmail.com). The source code and policy are available in the [ROS2 Type Navigator GitHub repository](https://github.com/EuphoricCatface/ROS2TypeNavigator).

# ROS2 Type Navigator privacy policy

Last updated: October 10, 2026

ROS2 Type Navigator is maintained by Seongyong Park. It adds navigable definitions to official ROS 2 documentation and provides a popup for opening documentation pages.

## Local processing

When you open the popup, the extension reads the current tab's URL to prefill navigation fields on supported ROS pages. On those pages, it reads the loaded interface definition to add links to referenced message types. This processing happens in your browser. The extension does not upload page contents, record browsing history, or store the full tab URL.

Private/incognito windows are disabled, so the extension does not read or save navigation values from those windows.

## Storage and retention

The extension stores two things in the browser's local extension storage:

- Your last submitted distro, package, interface type (`msg`, `srv`, or `action`), and interface name, to restore the navigator's fields.
- Your reformatting preference, to show or hide added definitions across documentation tabs.

These values are not synced through the browser's sync service or sent to the maintainer. Separate Name drafts for each interface type remain in memory only until the popup closes. Unsubmitted edits are not saved.

For current-tab navigation, values are saved before navigating and may remain saved even if navigation fails. For a new background tab, values are saved after the tab is created successfully.

Saved values remain until you replace them or remove the extension's local storage. Submitting new navigation values or changing the toggle replaces the corresponding setting. Uninstalling the extension removes its local storage; disabling it does not.

## Network activity and sharing

The extension has no analytics, advertising, telemetry, remote error reporting, or developer-operated backend. It does not sell user data or transmit locally processed URLs, page contents, or saved settings to the maintainer or analytics services.

Using Go or following a documentation link visits `https://docs.ros.org/`. The destination URL contains the selected documentation path. The website receives ordinary browser requests, including your IP address, request headers, and applicable cookies; its own privacy practices apply. The extension makes no additional background requests for documentation or package lists.

## Permissions

- **`activeTab`:** read the current tab's URL when you invoke the popup.
- **`storage`:** remember submitted navigation values and the reformatting preference locally.
- **Access to `https://docs.ros.org/en/*`:** read supported interface definitions and insert navigable links.

## Updates and contact

This policy will be updated if data handling changes. Contact Seongyong Park at [EuphoricCatface@gmail.com](mailto:EuphoricCatface@gmail.com) with privacy questions. The source code and policy are available in the [GitHub repository](https://github.com/EuphoricCatface/ROS2TypeNavigator).

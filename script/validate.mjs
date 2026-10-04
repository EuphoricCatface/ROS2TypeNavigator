/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import assert from "node:assert/strict";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { resolve, dirname, sep, isAbsolute } from "node:path";

// Local release checks, not a replacement for either store's submission review.
export function validateExtension(directory) {
  const root = realpathSync(directory);
  const manifest = JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3, "Expected Manifest V3");
  assert.ok(typeof manifest.name === "string" && manifest.name.length, "Missing extension name");
  assert.ok(typeof manifest.description === "string" && manifest.description.length <= 132, "Invalid description");
  assert.match(manifest.version, /^(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*)){0,3}$/, "Invalid version");
  assert.ok(manifest.version.split(".").every(part => Number(part) <= 65535), "Version component exceeds 65535");
  assert.equal(manifest.incognito, "not_allowed", "Private-window access must remain disabled");
  assert.deepEqual([...(manifest.permissions || [])].sort(), ["activeTab", "storage"], "Unexpected permissions");
  assert.ok(manifest.browser_specific_settings?.gecko?.id, "Missing Firefox extension ID");
  assert.deepEqual(manifest.browser_specific_settings.gecko.data_collection_permissions.required, ["none"], "Unexpected Firefox data collection declaration");

  const files = new Set(["manifest.json"]);
  function file(reference, parent = root) {
    assert.ok(typeof reference === "string" && reference.length, "Empty asset path");
    assert.ok(!isAbsolute(reference) && !/^[a-z][a-z0-9+.-]*:/i.test(reference) && !reference.includes("\\"), `Asset must be local: ${reference}`);
    const path = resolve(parent, reference);
    assert.ok(path.startsWith(root + sep), `Asset escapes extension directory: ${reference}`);
    const actual = realpathSync(path);
    assert.ok(actual.startsWith(root + sep), `Asset symlink escapes extension directory: ${reference}`);
    assert.equal(actual, path, `Symlink assets are not supported in release packages: ${reference}`);
    assert.ok(statSync(actual).isFile(), `Asset is not a file: ${reference}`);
    files.add(actual.slice(root.length + 1));
    return actual;
  }
  function icons(mapping) {
    assert.ok(mapping && Object.keys(mapping).length, "Missing icon mapping");
    for (const [size, reference] of Object.entries(mapping)) {
      assert.match(size, /^[1-9][0-9]*$/, "Invalid icon size");
      const path = file(reference);
      const png = readFileSync(path);
      assert.ok(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `Icon must be PNG: ${reference}`);
      assert.equal(png.readUInt32BE(16), Number(size), `Wrong icon width: ${reference}`);
      assert.equal(png.readUInt32BE(20), Number(size), `Wrong icon height: ${reference}`);
    }
  }
  icons(manifest.icons);
  icons(manifest.action?.default_icon);
  const popup = file(manifest.action?.default_popup);
  assert.ok(Array.isArray(manifest.content_scripts) && manifest.content_scripts.length, "Missing content scripts");
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, ["https://docs.ros.org/en/*"], "Unexpected content script scope");
    assert.ok(Array.isArray(script.js) && script.js.length, "Missing content script JavaScript");
    for (const reference of [...script.js, ...(script.css || [])]) file(reference);
  }

  const visited = new Set();
  function resources(path) {
    if (visited.has(path)) return;
    visited.add(path);
    const source = readFileSync(path, "utf8");
    const references = path.endsWith(".html")
      ? [...source.matchAll(/<(?:script|link|img)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1])
      : path.endsWith(".css")
        ? [...source.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi)].map(match => match[1] || match[2]) : [];
    for (const reference of references) {
      if (reference.startsWith("#") || reference.startsWith("data:")) continue;
      const dependency = file(reference, dirname(path));
      if (/\.(?:html|css)$/.test(dependency)) resources(dependency);
    }
  }
  resources(popup);
  for (const reference of [...files]) if (reference.endsWith(".css")) resources(resolve(root, reference));
  return { manifest, files: [...files].sort() };
}

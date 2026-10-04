/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { resolve } = require("node:path");

test("release validation rejects missing resources, path escapes, icon sizes, and private access", async () => {
  const { validateExtension } = await import("../script/validate.mjs");
  const source = resolve(__dirname, "../extension");
  const directory = mkdtempSync(resolve(tmpdir(), "ros-navigator-validation-"));
  try {
    cpSync(source, directory, { recursive: true });
    const path = resolve(directory, "manifest.json");
    const original = JSON.parse(readFileSync(path, "utf8"));
    assert.ok(validateExtension(directory).files.includes("popup.js"));
    for (const edit of [
      manifest => { manifest.action.default_popup = "missing.html"; },
      manifest => { manifest.action.default_popup = "../outside.html"; },
      manifest => { manifest.icons["32"] = "icons/icon-48.png"; },
      manifest => { manifest.incognito = "spanning"; },
    ]) {
      const manifest = structuredClone(original);
      edit(manifest);
      writeFileSync(path, JSON.stringify(manifest));
      assert.throws(() => validateExtension(directory));
    }
    writeFileSync(path, JSON.stringify(original));
    writeFileSync(resolve(directory, "popup.html"), '<script src="missing.js"></script>');
    assert.throws(() => validateExtension(directory));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

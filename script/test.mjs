#!/usr/bin/env node
/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validateExtension } from "./validate.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error(`${command} failed (${result.status ?? result.signal})`);
}
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? files(path) : [path];
  });
}
try {
  const tests = files(resolve(root, "tests")).filter(path => path.endsWith(".test.cjs")).sort();
  run(process.execPath, ["--test", "--test-isolation=none", ...tests]);
  const sources = ["extension", "tests", "script"].flatMap(dir => files(resolve(root, dir)));
  for (const source of sources.filter(path => /\.(?:js|cjs|mjs)$/.test(path))) run(process.execPath, ["--check", source]);
  // Parse Python without executing it or creating bytecode caches.
  run("python3", ["-c", "import ast, pathlib, sys; [ast.parse(pathlib.Path(p).read_text(), filename=p) for p in sys.argv[1:]]", ...sources.filter(path => path.endsWith(".py"))]);
  console.log("JavaScript and Python syntax checks passed.");
  const { manifest, files: assets } = validateExtension(resolve(root, "extension"));
  for (const name of ["LICENSE", "PRIVACY.md"]) if (!readFileSync(resolve(root, name), "utf8").trim()) throw Error(`Empty ${name}`);
  console.log(`Manifest ${manifest.version} and ${assets.length} runtime asset paths validated.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

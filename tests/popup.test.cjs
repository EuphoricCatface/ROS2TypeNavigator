/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/core.js");
const popup = require("../extension/popup.js");
const values = { distro: "jazzy", pkg: "sensor_msgs", type: "msg", name: "PointCloud2" };

function fake(overrides = {}) {
  const calls = [];
  const api = {
    currentUrl: async () => "about:blank", readSaved: async () => values,
    createTab: async url => { calls.push(["create", url]); return { id: 7 }; },
    save: async input => { calls.push(["save", input]); },
    navigateCurrent: async url => { calls.push(["navigate", url]); },
    ...overrides,
  };
  return { api, calls, close: () => calls.push(["close"]) };
}

test("initialization tolerates unavailable tab URLs and storage failures", async () => {
  assert.deepEqual(await popup.initialize(fake().api), values);
  assert.deepEqual(await popup.initialize(fake({
    currentUrl: async () => "https://docs.ros.org/en/humble/p/",
    readSaved: async () => { throw Error("denied"); },
  }).api), { ...core.DEFAULTS, distro: "humble" });
  assert.deepEqual(await popup.initialize(fake({
    currentUrl: async () => { throw Error("denied"); },
    readSaved: async () => { throw Error("denied"); },
  }).api), core.DEFAULTS);
});

test("middle click creates a background tab, then saves and closes the popup", async () => {
  const f = fake();
  assert.deepEqual(await popup.createSubmitter(f.api, f.close)(values, true), { ok: true });
  assert.deepEqual(f.calls, [["create", "https://docs.ros.org/en/jazzy/p/sensor_msgs/msg/PointCloud2.html"], ["save", values], ["close"]]);
});

test("storage failure does not prevent navigation", async () => {
  const f = fake({ save: async () => { throw Error("unavailable"); } });
  assert.equal((await popup.createSubmitter(f.api, f.close)(values)).ok, true);
  assert.deepEqual(f.calls.map(call => call[0]), ["navigate", "close"]);
});

test("invalid input does not open or save anything", async () => {
  const f = fake();
  const result = await popup.createSubmitter(f.api, f.close)({ ...values, pkg: "" });
  assert.equal(result.field, "pkg");
  assert.deepEqual(f.calls, []);
});

test("creation failure leaves the popup open, preserves stored values, and permits retry", async () => {
  let fail = true;
  const f = fake({ createTab: async () => { if (fail) throw Error("failed"); return { id: 7 }; } });
  const submit = popup.createSubmitter(f.api, f.close);
  assert.match((await submit(values, true)).error, /Could not open/);
  assert.deepEqual(f.calls, []);
  fail = false;
  assert.equal((await submit(values, true)).ok, true);
});

test("left click saves before navigating the current tab and closes on success", async () => {
  const f = fake();
  assert.equal((await popup.createSubmitter(f.api, f.close)(values)).ok, true);
  assert.deepEqual(f.calls, [["save", values], ["navigate", "https://docs.ros.org/en/jazzy/p/sensor_msgs/msg/PointCloud2.html"], ["close"]]);
});

test("current-tab failure keeps the popup open and permits retry", async () => {
  let fail = true;
  const f = fake({ navigateCurrent: async url => { if (fail) throw Error("failed"); f.calls.push(["navigate", url]); } });
  const submit = popup.createSubmitter(f.api, f.close);
  assert.match((await submit(values)).error, /in this tab/);
  assert.deepEqual(f.calls, [["save", values]]);
  fail = false;
  assert.equal((await submit(values)).ok, true);
  assert.equal(f.calls.at(-1)[0], "close");
});

test("concurrent submissions open exactly one tab", async () => {
  let release;
  let count = 0;
  const f = fake({ createTab: async () => { count++; return new Promise(resolve => { release = () => resolve({ id: 7 }); }); } });
  const submit = popup.createSubmitter(f.api, f.close);
  const first = submit(values, true);
  assert.deepEqual(await submit(values), { ok: false, busy: true });
  release();
  await first;
  assert.equal(count, 1);
});

test("browser adapter uses narrow tab and local-storage APIs", async () => {
  const calls = [];
  const api = popup.createAdapter({
    tabs: {
      query: async query => { calls.push(query); return [{ url: "https://docs.ros.org/en/rolling/p/" }]; },
      create: async options => { calls.push(options); return { id: 3 }; },
      update: async (id, options) => { calls.push([id, options]); },
    },
    storage: { local: { get: async () => ({ lastNavigation: values, reformatEnabled: false }), set: async data => { calls.push(data); } } },
  });
  assert.equal(await api.currentUrl(), "https://docs.ros.org/en/rolling/p/");
  assert.deepEqual(await api.readSaved(), values);
  assert.equal(await api.readEnabled(), false);
  await api.setEnabled(true);
  await api.createTab("https://docs.ros.org/en/rolling/p/");
  await api.save(values);
  await api.navigateCurrent("https://docs.ros.org/en/rolling/p/");
  assert.deepEqual(calls, [{ active: true, currentWindow: true }, { reformatEnabled: true }, { url: "https://docs.ros.org/en/rolling/p/", active: false }, { lastNavigation: values }, [{ url: "https://docs.ros.org/en/rolling/p/" }, undefined]]);
});

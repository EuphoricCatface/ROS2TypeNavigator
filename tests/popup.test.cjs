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
    activateTab: async id => { calls.push(["activate", id]); },
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

test("saves only after tab creation, before activating and closing the popup", async () => {
  const f = fake();
  assert.deepEqual(await popup.createSubmitter(f.api, f.close)(values), { ok: true });
  assert.deepEqual(f.calls, [["create", "https://docs.ros.org/en/jazzy/p/sensor_msgs/msg/PointCloud2.html"], ["save", values], ["activate", 7], ["close"]]);
});

test("storage failure does not prevent navigation", async () => {
  const f = fake({ save: async () => { throw Error("unavailable"); } });
  assert.equal((await popup.createSubmitter(f.api, f.close)(values)).ok, true);
  assert.deepEqual(f.calls.map(call => call[0]), ["create", "activate", "close"]);
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
  assert.match((await submit(values)).error, /Could not open/);
  assert.deepEqual(f.calls, []);
  fail = false;
  assert.equal((await submit(values)).ok, true);
});

test("activation failure accurately reports the existing background tab", async () => {
  const f = fake({ activateTab: async () => { throw Error("failed"); } });
  assert.match((await popup.createSubmitter(f.api, f.close)(values)).error, /background tab/);
  assert.ok(!f.calls.some(call => call[0] === "close"));
});

test("concurrent submissions open exactly one tab", async () => {
  let release;
  let count = 0;
  const f = fake({ createTab: async () => { count++; return new Promise(resolve => { release = () => resolve({ id: 7 }); }); } });
  const submit = popup.createSubmitter(f.api, f.close);
  const first = submit(values);
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
    storage: { local: { get: async () => ({ lastNavigation: values }), set: async data => { calls.push(data); } } },
  });
  assert.equal(await api.currentUrl(), "https://docs.ros.org/en/rolling/p/");
  assert.deepEqual(await api.readSaved(), values);
  await api.createTab("https://docs.ros.org/en/rolling/p/");
  await api.save(values);
  await api.activateTab(3);
  assert.deepEqual(calls, [{ active: true, currentWindow: true }, { url: "https://docs.ros.org/en/rolling/p/", active: false }, { lastNavigation: values }, [3, { active: true }]]);
});

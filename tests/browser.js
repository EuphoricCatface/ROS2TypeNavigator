/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(async function () {
  "use strict";
  const results = [];
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const test = async (name, run) => {
    try { await run(); results.push({ name, ok: true }); }
    catch (error) { results.push({ name, ok: false, error: error.stack }); }
  };
  const parser = new DOMParser();
  const fixture = async name => parser.parseFromString(await (await fetch(`fixtures/${name}.html`)).text(), "text/html");
  const page = globalThis.ROSTypeNavigatorPage;
  const messageUrl = "https://docs.ros.org/en/humble/p/sensor_msgs/msg/PointCloud2.html";
  const serviceUrl = "https://docs.ros.org/en/humble/p/action_msgs/srv/CancelGoal.html";
  const sectionId = "ros2-type-navigator-definition";
  const section = doc => doc.getElementById(sectionId);
  const tick = () => new Promise(resolve => setTimeout(resolve, 0));

  await test("message: source selection, text extraction, placement, links, and safe rendering", async () => {
    const doc = await fixture("message");
    const source = page.findSource(doc);
    const before = source.block.outerHTML;
    assert(page.enhance(doc, messageUrl), "message not enhanced");
    assert(source.block.outerHTML === before, "original source changed");
    assert(source.block.nextElementSibling === section(doc), "definition inserted in wrong location");
    assert(section(doc).nextElementSibling.id === "after-source", "following content moved");
    const links = [...section(doc).querySelectorAll("a")];
    assert(links.length === 3, `expected three links, got ${links.length}`);
    assert(links[0].href === "https://docs.ros.org/en/humble/p/std_msgs/msg/Header.html", "wrong qualified link");
    assert(links[1].href === "https://docs.ros.org/en/humble/p/sensor_msgs/msg/PointField.html", "wrong local link");
    assert(links[2].nextSibling.textContent.startsWith("[<=10]"), "array bound lost");
    assert(!links.some(link => link.hasAttribute("target")), "ordinary link behavior changed");
    assert(section(doc).textContent.includes('string<=32 label "a  # b"'), "literal corrupted");
    assert(section(doc).textContent.includes("sequence<PointField> unsupported"), "unsupported syntax lost");
    assert(!section(doc).querySelector("img, script"), "source became executable HTML");
    document.getElementById("preview").append(document.importNode(section(doc), true));
  });

  await test("enhancement is idempotent", async () => {
    const doc = await fixture("message");
    page.enhance(doc, messageUrl);
    assert(!page.enhance(doc, messageUrl), "second invocation should skip");
    assert(doc.querySelectorAll(`#${sectionId}`).length === 1, "duplicate section");
  });

  await test("reformat preference updates open pages and wins over an older initial read", async () => {
    const doc = await fixture("message");
    const original = doc.documentElement.outerHTML;
    const listeners = new Set();
    let resolveRead;
    const connection = page.connect(doc, messageUrl, {
      local: { get: () => new Promise(resolve => { resolveRead = resolve; }) },
      onChanged: { addListener: fn => listeners.add(fn), removeListener: fn => listeners.delete(fn) },
    });
    const change = (enabled, area = "local") => listeners.forEach(fn => fn({ reformatEnabled: { newValue: enabled } }, area));
    change(false);
    resolveRead({ reformatEnabled: true });
    const disconnect = await connection;
    assert(!section(doc), "stale initial read overrode disabled preference");
    change(true, "sync");
    assert(!section(doc), "sync setting affected local preference");
    change(true);
    change(true);
    assert(doc.querySelectorAll(`#${sectionId}`).length === 1, "enabling added duplicate sections");
    change(false);
    assert(doc.documentElement.outerHTML === original, "disabling changed original documentation");
    disconnect();
    assert(listeners.size === 0, "preference listener was not removed");
  });

  await test("service: request/response split and same-package message links", async () => {
    const doc = await fixture("service");
    page.enhance(doc, serviceUrl);
    assert([...section(doc).querySelectorAll("h3")].map(el => el.textContent).join(",") === "Request,Response", "service labels missing");
    assert([...section(doc).querySelectorAll("a")].every(a => a.href === "https://docs.ros.org/en/humble/p/action_msgs/msg/GoalInfo.html"), "service referenced srv instead of msg");
    assert(section(doc).textContent.includes("int8 ERROR_NONE=0"), "constant lost");
  });

  await test("empty messages and service halves display (empty)", () => {
    for (const [source, url, count] of [["# only comments", messageUrl, 1], ["---", serviceUrl, 2]]) {
      const doc = parser.parseFromString("<main><p><strong>Source</strong></p><pre></pre></main>", "text/html");
      doc.querySelector("pre").textContent = source;
      page.enhance(doc, url);
      assert([...section(doc).querySelectorAll("code")].filter(code => code.textContent === "(empty)").length === count, "empty definition mislabeled");
    }
  });

  await test("missing, ambiguous, and unsupported pages remain untouched", async () => {
    const missing = parser.parseFromString("<main><h1>Access denied</h1></main>", "text/html");
    const before = missing.documentElement.outerHTML;
    assert(!page.enhance(missing, messageUrl), "missing source enhanced");
    assert(missing.documentElement.outerHTML === before, "error page changed");
    const ambiguous = await fixture("message");
    const main = ambiguous.querySelector("[role=main]");
    main.append(main.firstElementChild.cloneNode(true));
    assert(!page.enhance(ambiguous, messageUrl), "ambiguous source chosen");
    const unsupported = await fixture("message");
    assert(!page.enhance(unsupported, "https://docs.ros2.org/foxy/api/sensor_msgs/msg/PointCloud2.html"), "unsupported URL enhanced");
  });

  await test("popup: prefill, accessible validation, form submission, and successful navigation", async () => {
    const frame = document.getElementById("popup");
    if (frame.contentDocument.readyState !== "complete") await new Promise(resolve => frame.addEventListener("load", resolve, { once: true }));
    const doc = frame.contentDocument;
    const calls = [];
    const settingCalls = [];
    let enabled = true;
    let failSetting = false;
    const api = {
      currentUrl: async () => serviceUrl,
      readSaved: async () => undefined,
      readEnabled: async () => enabled,
      setEnabled: async value => {
        if (failSetting) throw Error("unavailable");
        enabled = value;
        settingCalls.push(value);
      },
      createTab: async url => { calls.push(["create", url]); return { id: 2 }; },
      save: async values => calls.push(["save", values]),
      navigateCurrent: async url => calls.push(["navigate", url]),
    };
    await globalThis.ROSTypeNavigatorPopup.mount(doc, api, () => calls.push(["close"]));
    const toggle = doc.getElementById("reformat-enabled");
    assert(toggle.checked && !toggle.disabled, "reformat toggle did not initialize");
    failSetting = true;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await tick();
    assert(toggle.checked && !doc.getElementById("reformat-status").hidden, "failed setting write was not reverted and reported");
    failSetting = false;
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));
    await tick();
    assert(settingCalls.join(",") === "false" && doc.getElementById("reformat-status").hidden, "toggle did not save disabled preference");
    assert(doc.getElementById("name").value === "CancelGoal", "name not prefilled");
    assert(doc.getElementById("type").value === "srv", "kind not prefilled");
    assert(doc.getElementById("pkg").placeholder === "ex: nav_msgs", "initial service package example missing");
    assert(doc.getElementById("name").placeholder === "ex: SetMap", "initial service name example missing");
    const type = doc.getElementById("type");
    type.value = "msg";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    assert(doc.getElementById("pkg").placeholder === "ex: visualization_msgs", "message package example missing");
    assert(doc.getElementById("name").placeholder === "ex: Marker", "message name example missing");
    const name = doc.getElementById("name");
    assert(doc.getElementById("pkg").value === "action_msgs" && name.value === "", "new type should clear only the name");
    name.value = "GoalInfo";
    type.value = "srv";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    assert(doc.getElementById("pkg").placeholder === "ex: nav_msgs" && doc.getElementById("name").placeholder === "ex: SetMap", "switching back to service did not update examples");
    assert(name.value === "CancelGoal", "prefilled service name was lost");
    name.value = "EditedService";
    type.value = "msg";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    assert(name.value === "GoalInfo", "message draft was lost");
    name.value = "";
    type.value = "srv";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    assert(name.value === "EditedService", "edited service draft was lost");
    type.value = "msg";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    assert(name.value === "", "cleared message draft was not preserved");
    assert(calls.length === 0, "type switching saved or navigated");
    const reopened = parser.parseFromString(doc.documentElement.outerHTML, "text/html");
    await globalThis.ROSTypeNavigatorPopup.mount(reopened, api, () => {});
    assert(!reopened.getElementById("reformat-enabled").checked, "reformat preference was not restored");
    const reopenedType = reopened.getElementById("type");
    assert(reopened.getElementById("name").value === "CancelGoal", "reopening retained an unsubmitted service draft");
    reopenedType.value = "msg";
    reopenedType.dispatchEvent(new Event("change", { bubbles: true }));
    assert(reopened.getElementById("name").value === "", "reopening retained an unsubmitted message draft");
    type.value = "srv";
    type.dispatchEvent(new Event("change", { bubbles: true }));
    name.value = "CancelGoal";
    const form = doc.getElementById("navigator");
    doc.getElementById("pkg").value = "";
    form.requestSubmit();
    await tick();
    assert(!doc.getElementById("error").hidden, "error not visible");
    assert(doc.getElementById("pkg").getAttribute("aria-invalid") === "true", "invalid field not marked");
    assert(doc.activeElement.id === "pkg", "focus not moved to invalid field");
    assert(calls.length === 0, "invalid input navigated");
    doc.getElementById("pkg").value = "action_msgs";
    doc.getElementById("pkg").dispatchEvent(new Event("input", { bubbles: true }));
    assert(doc.getElementById("error").hidden, "error not cleared on edit");
    form.requestSubmit();
    await tick();
    assert(calls.map(call => call[0]).join(",") === "save,navigate,close", "incorrect submit lifecycle");
    assert(calls[1][1] === serviceUrl, "wrong navigation URL");
    assert(!doc.getElementById("go").disabled, "submit remains disabled");
    calls.length = 0;
    const go = doc.getElementById("go");
    doc.getElementById("pkg").value = "";
    go.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    await tick();
    assert(calls.length === 0 && !doc.getElementById("error").hidden, "middle click bypassed validation");
    doc.getElementById("pkg").value = "action_msgs";
    go.dispatchEvent(new MouseEvent("auxclick", { button: 2, bubbles: true }));
    await tick();
    assert(calls.length === 0, "right click navigated");
    go.dispatchEvent(new MouseEvent("auxclick", { button: 1, bubbles: true, cancelable: true }));
    await tick();
    assert(calls.map(call => call[0]).join(",") === "create,save,close", "middle click did not open a new tab");
    assert(calls[0][1] === serviceUrl, "wrong middle-click destination");
    assert(doc.getElementById("error").hidden, "valid middle click left a stale error");

    assert(doc.documentElement.scrollWidth <= frame.clientWidth, "popup overflows horizontally");
  });

  globalThis.testResults = { results, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
  document.getElementById("results").textContent = results.map(r => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.error ? `\n${r.error}` : ""}`).join("\n");
  document.title = `${globalThis.testResults.failed ? "FAIL" : "PASS"}: ROS2 browser tests`;
})();

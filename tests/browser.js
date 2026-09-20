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
    const api = {
      currentUrl: async () => serviceUrl,
      readSaved: async () => undefined,
      createTab: async url => { calls.push(["create", url]); return { id: 2 }; },
      save: async values => calls.push(["save", values]),
      activateTab: async id => calls.push(["activate", id]),
    };
    await globalThis.ROSTypeNavigatorPopup.mount(doc, api, () => calls.push(["close"]));
    assert(doc.getElementById("name").value === "CancelGoal", "name not prefilled");
    assert(doc.getElementById("type").value === "srv", "kind not prefilled");
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
    assert(calls.map(call => call[0]).join(",") === "create,save,activate,close", "incorrect submit lifecycle");
    assert(calls[0][1] === serviceUrl, "wrong navigation URL");
    assert(!doc.getElementById("go").disabled, "submit remains disabled");
    assert(doc.documentElement.scrollWidth <= frame.clientWidth, "popup overflows horizontally");
  });

  globalThis.testResults = { results, passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok).length };
  document.getElementById("results").textContent = results.map(r => `${r.ok ? "PASS" : "FAIL"} ${r.name}${r.error ? `\n${r.error}` : ""}`).join("\n");
  document.title = `${globalThis.testResults.failed ? "FAIL" : "PASS"}: ROS2 browser tests`;
})();

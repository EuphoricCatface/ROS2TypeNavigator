/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
// Development-only browser checks. Uses Node >=22 and installed browsers; no npm packages.
import { createServer } from "node:http";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { resolve, dirname, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(resolve(root, "extension/manifest.json"), "utf8"));
const browser = process.argv[2] || "chromium";
if (!["chromium", "firefox"].includes(browser)) throw Error("Use chromium or firefox.");
const live = process.argv.includes("--live");
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await fn();
    if (result) return result;
    await pause(100);
  }
  throw Error(`Timed out: ${label}`);
}

class Protocol {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 0;
    this.pending = new Map();
    this.events = new Map();
    this.eventErrors = [];
    socket.addEventListener("message", event => {
      const response = JSON.parse(event.data);
      if (response.method) {
        for (const handler of this.events.get(response.method) || []) {
          Promise.resolve(handler(response.params, response.sessionId)).catch(error => this.eventErrors.push(error));
        }
      }
      const pending = this.pending.get(response.id);
      if (!pending) return;
      this.pending.delete(response.id);
      clearTimeout(pending.timer);
      if (response.error || response.type === "error") pending.reject(Error(JSON.stringify(response)));
      else pending.resolve(response.result);
    });
  }
  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new Protocol(socket);
  }
  send(method, params = {}, sessionId) {
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error(`Timed out: ${method}`)); }, 30000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  close() { this.socket.close(); }
}

const server = createServer(async (req, res) => {
  try {
    const path = resolve(root, `.${decodeURIComponent(new URL(req.url, "http://localhost").pathname)}`);
    if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
    const content = await readFile(path);
    const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };
    res.setHeader("Content-Type", `${mime[extname(path)] || "text/plain"}; charset=utf-8`);
    res.end(content);
  } catch { res.writeHead(404).end("Not found"); }
});
let processHandle;
let protocol;
let profile;
let logs = "";
try {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  profile = await mkdtemp(resolve(tmpdir(), "ros-navigator-browser-"));
  const firefoxUuid = "5fa40393-83a8-40ed-b50e-a71c1bc7e470";
  if (browser === "firefox") {
    await writeFile(resolve(profile, "user.js"), `user_pref("extensions.webextensions.uuids", ${JSON.stringify(JSON.stringify({ [manifest.browser_specific_settings.gecko.id]: firefoxUuid }))});\n`);
  }
  const args = browser === "chromium"
    ? ["--headless=new", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--enable-unsafe-extension-debugging", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "about:blank"]
    : ["--headless", "--no-remote", "--profile", profile, "--remote-debugging-port=0", "--remote-allow-system-access", "about:blank"];
  processHandle = spawn(browser, args, { stdio: ["ignore", "pipe", "pipe"] });
  let launchError;
  processHandle.on("error", error => { launchError = error; });
  processHandle.stdout.on("data", chunk => { logs += chunk; });
  processHandle.stderr.on("data", chunk => { logs += chunk; });
  const endpoint = await until(() => {
    if (launchError) throw launchError;
    if (processHandle.exitCode !== null) throw Error(`Browser exited: ${logs}`);
    return logs.match(browser === "chromium" ? /DevTools listening on (ws:\/\/\S+)/ : /WebDriver BiDi listening on (ws:\/\/\S+)/)?.[1];
  }, "browser startup");
  protocol = await Protocol.connect(browser === "firefox" ? `${endpoint}/session` : endpoint);

  let evaluate, navigate, screenshot, popupUrl, interceptFixtures, tabUrls;
  const fixtureBody = async url => {
    const name = url.includes("/srv/") ? "service" : url.includes("/action/") ? "action" : "message";
    return (await readFile(resolve(root, `tests/fixtures/${name}.html`))).toString("base64");
  };
  if (browser === "chromium") {
    const { id } = await protocol.send("Extensions.loadUnpacked", { path: resolve(root, "extension") });
    popupUrl = `chrome-extension://${id}/popup.html`;
    const { targetId } = await protocol.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await protocol.send("Target.attachToTarget", { targetId, flatten: true });
    tabUrls = async () => (await protocol.send("Target.getTargets")).targetInfos.map(target => target.url);
    await protocol.send("Page.enable", {}, sessionId);
    evaluate = async expression => {
      const response = await protocol.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (response.exceptionDetails) throw Error(JSON.stringify(response.exceptionDetails));
      return response.result.value;
    };
    navigate = async url => {
      await protocol.send("Page.navigate", { url }, sessionId);
      await until(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`), `load ${url}`);
    };
    screenshot = async path => {
      const { data } = await protocol.send("Page.captureScreenshot", { format: "png" }, sessionId);
      await writeFile(path, Buffer.from(data, "base64"));
    };
    interceptFixtures = async () => {
      protocol.on("Fetch.requestPaused", async (params, eventSession) => {
        await protocol.send("Fetch.fulfillRequest", {
          requestId: params.requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
          body: await fixtureBody(params.request.url),
        }, eventSession);
      });
      await protocol.send("Fetch.enable", { patterns: [{ urlPattern: "https://docs.ros.org/*", resourceType: "Document" }] }, sessionId);
      return () => protocol.send("Fetch.disable", {}, sessionId);
    };
  } else {
    await protocol.send("session.new", { capabilities: { alwaysMatch: { acceptInsecureCerts: false } } });
    const installed = await protocol.send("webExtension.install", { extensionData: { type: "path", path: resolve(root, "extension") } });
    console.log(`Firefox installed: ${installed.extension}`);
    popupUrl = `moz-extension://${firefoxUuid}/popup.html`;
    const { context } = await protocol.send("browsingContext.create", { type: "tab" });
    tabUrls = async () => (await protocol.send("browsingContext.getTree", { maxDepth: 0 })).contexts.map(tab => tab.url);
    evaluate = async expression => {
      const response = await protocol.send("script.evaluate", { expression: `(async () => JSON.stringify(await (${expression})))()`, target: { context }, awaitPromise: true });
      if (response.type === "exception") throw Error(JSON.stringify(response.exceptionDetails));
      return response.result.value === undefined ? undefined : JSON.parse(response.result.value);
    };
    let extensionPage = false;
    navigate = async url => {
      if (url.startsWith("moz-extension:") || extensionPage) {
        // BiDi prohibits direct navigation to extension URLs from a content context.
        // Open our installed extension through browser chrome in this disposable profile.
        const tree = await protocol.send("browsingContext.getTree", { "moz:scope": "chrome" });
        const response = await protocol.send("script.evaluate", {
          expression: `globalThis.rosNavigatorTestBrowser ||= gBrowser.selectedBrowser; gBrowser.selectedTab = gBrowser.getTabForBrowser(globalThis.rosNavigatorTestBrowser); globalThis.rosNavigatorTestBrowser.loadURI(Services.io.newURI(${JSON.stringify(url)}), { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() })`,
          target: { context: tree.contexts[0].context }, awaitPromise: false,
        });
        if (response.type === "exception") throw Error(JSON.stringify(response.exceptionDetails));
        await until(() => evaluate(`location.href === ${JSON.stringify(url)} && document.readyState === 'complete'`), "Firefox extension page");
      } else await protocol.send("browsingContext.navigate", { context, url, wait: "complete" });
      extensionPage = url.startsWith("moz-extension:");
    };
    screenshot = async path => {
      const { data } = await protocol.send("browsingContext.captureScreenshot", { context });
      await writeFile(path, Buffer.from(data, "base64"));
    };
    interceptFixtures = async () => {
      await protocol.send("session.subscribe", { events: ["network.beforeRequestSent"] });
      protocol.on("network.beforeRequestSent", async params => {
        if (!params.isBlocked) return;
        await protocol.send("network.provideResponse", {
          request: params.request.request, statusCode: 200,
          headers: [{ name: "Content-Type", value: { type: "string", value: "text/html; charset=utf-8" } }],
          body: { type: "base64", value: await fixtureBody(params.request.url) },
        });
      });
      const { intercept } = await protocol.send("network.addIntercept", {
        phases: ["beforeRequestSent"], urlPatterns: [{ type: "pattern", protocol: "https", hostname: "docs.ros.org" }],
      });
      return () => protocol.send("network.removeIntercept", { intercept });
    };
  }

  await navigate(`http://127.0.0.1:${server.address().port}/tests/browser.html`);
  const results = await until(() => evaluate("globalThis.testResults"), "browser harness");
  console.log(JSON.stringify({ browser, ...results }, null, 2));
  assert.equal(results.failed, 0, "Browser harness failed");
  const screenshotPath = resolve(tmpdir(), `ros-navigator-${browser}-popup.png`);
  if (browser === "firefox") await screenshot(screenshotPath);

  await navigate(popupUrl);
  await until(() => evaluate("document.getElementById('fields')?.disabled === false"), "extension popup initialization");
  assert.equal(await evaluate("document.getElementById('distro').value"), "rolling");
  assert.equal(await evaluate("(globalThis.browser || chrome).extension.isAllowedIncognitoAccess()"), false);
  if (browser === "chromium") await screenshot(screenshotPath);
  console.log(`Installed extension popup initialized; screenshot: ${screenshotPath}`);

  const removeInterception = await interceptFixtures();
  const fixtureUrl = "https://docs.ros.org/en/humble/p/action_msgs/srv/CancelGoal.html";
  await evaluate("(document.getElementById('reformat-enabled').click(), true)");
  await until(() => evaluate("(async () => (await (globalThis.browser || chrome).storage.local.get('reformatEnabled')).reformatEnabled === false)()"), "saved disabled reformatting preference");
  await navigate(fixtureUrl);
  assert.equal(await evaluate("new Promise(resolve => setTimeout(() => resolve(!!document.getElementById('ros2-type-navigator-definition')), 200))"), false);
  await navigate(popupUrl);
  await until(() => evaluate("document.getElementById('fields')?.disabled === false"), "disabled preference popup reload");
  assert.equal(await evaluate("document.getElementById('reformat-enabled').checked"), false);
  await evaluate("(document.getElementById('reformat-enabled').click(), true)");
  await until(() => evaluate("(async () => (await (globalThis.browser || chrome).storage.local.get('reformatEnabled')).reformatEnabled === true)()"), "saved enabled reformatting preference");
  console.log("Installed extension: private access denied and reformatting preference persisted.");
  await navigate(fixtureUrl);
  await until(() => evaluate("!!document.getElementById('ros2-type-navigator-definition')"), "installed content script injection");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#ros2-type-navigator-definition a')].map(a => a.href)"), [
    "https://docs.ros.org/en/humble/p/action_msgs/msg/GoalInfo.html",
    "https://docs.ros.org/en/humble/p/action_msgs/msg/GoalInfo.html",
  ]);
  await evaluate("(document.querySelector('#ros2-type-navigator-definition a').click(), true)");
  await until(() => evaluate("location.pathname.endsWith('/msg/GoalInfo.html') && !!document.getElementById('ros2-type-navigator-definition')"), "follow message link");
  await evaluate("(history.back(), true)");
  await until(() => evaluate(`location.href === ${JSON.stringify(fixtureUrl)} && document.querySelectorAll('#ros2-type-navigator-definition').length === 1`), "Back navigation");
  console.log("Installed extension: automatic injection, service links, linked navigation, and Back passed.");

  await navigate("https://docs.ros.org/en/rolling/p/control_msgs/action/FollowJointTrajectory.html");
  await until(() => evaluate("document.querySelectorAll('#ros2-type-navigator-definition h3').length === 3"), "installed action enhancement");
  assert.deepEqual(await evaluate("[...document.querySelectorAll('#ros2-type-navigator-definition h3')].map(h => h.textContent)"), ["Goal", "Result", "Feedback"]);
  assert.ok((await evaluate("[...document.querySelectorAll('#ros2-type-navigator-definition a')].map(a => a.href)")).every(url => url.includes("/msg/")));
  console.log("Installed extension: action goal, result, and feedback enhancement passed.");

  await navigate(popupUrl);
  await until(() => evaluate("document.getElementById('fields')?.disabled === false"), "popup reload");
  // Keep this extension tab open to inspect the native APIs after submission.
  // The popup controller itself is shared with the real toolbar action.
  await evaluate(`(() => {
    window.close = () => { window.testCloseCalled = true; };
    (globalThis.browser || chrome).tabs.onCreated.addListener(tab => { window.testCreatedId = tab.id; });
    for (const [key, value] of Object.entries({ distro: 'humble', pkg: 'action_msgs', type: 'srv', name: 'CancelGoal' })) document.getElementById(key).value = value;
    document.getElementById('go').dispatchEvent(new MouseEvent('auxclick', {button:1,bubbles:true,cancelable:true}));
    return true;
  })()`);
  await until(() => evaluate("window.testCloseCalled === true"), "native tab creation and storage");
  const stored = await evaluate("(async () => (await (globalThis.browser || chrome).storage.local.get('lastNavigation')).lastNavigation)()");
  assert.deepEqual(stored, { distro: "humble", pkg: "action_msgs", type: "srv", name: "CancelGoal" });
  const active = await evaluate("(async () => (await (globalThis.browser || chrome).tabs.query({active:true,currentWindow:true}))[0].id)()");
  assert.notEqual(active, await evaluate("window.testCreatedId"));
  assert.ok((await tabUrls()).includes(fixtureUrl), "Submitted URL was not opened");
  console.log("Installed extension: middle click created a background tab and persisted the submitted values.");
  const tabsBefore = (await tabUrls()).length;
  await evaluate("(document.getElementById('go').click(), true)");
  await until(() => evaluate(`location.href === ${JSON.stringify(fixtureUrl)} && !!document.getElementById('ros2-type-navigator-definition')`), "left-click current-tab navigation");
  assert.equal((await tabUrls()).length, tabsBefore, "Left click created a new tab");
  console.log("Installed extension: left click navigated the current tab without creating another.");
  await removeInterception();
  assert.deepEqual(protocol.eventErrors, [], "Browser interception failed");

  if (live) {
    for (const url of [
      "https://docs.ros.org/en/humble/p/action_msgs/srv/CancelGoal.html",
      "https://docs.ros.org/en/humble/p/sensor_msgs/msg/PointCloud2.html",
      "https://docs.ros.org/en/rolling/p/control_msgs/action/FollowJointTrajectory.html",
    ]) {
      await navigate(url);
      try {
        await until(() => evaluate("!!document.getElementById('ros2-type-navigator-definition')"), `live enhancement: ${url}`);
      } catch (error) {
        console.error("Live page diagnostic:", await evaluate("({url: location.href, title: document.title, text: document.body.innerText.slice(0, 1200)})"));
        throw error;
      }
      const links = await evaluate("[...document.querySelectorAll('#ros2-type-navigator-definition a')].map(a => a.href)");
      assert.ok(links.length > 0, "No live type links");
      console.log(JSON.stringify({ live: url, links }));
    }
  }
} catch (error) {
  console.error(error);
  if (logs) console.error(logs.slice(-4000));
  process.exitCode = 1;
} finally {
  protocol?.close();
  if (processHandle && processHandle.exitCode === null) {
    processHandle.kill("SIGTERM");
    await Promise.race([new Promise(resolve => processHandle.once("exit", resolve)), pause(5000)]);
    if (processHandle.exitCode === null && processHandle.signalCode === null) processHandle.kill("SIGKILL");
  }
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (profile) await rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}

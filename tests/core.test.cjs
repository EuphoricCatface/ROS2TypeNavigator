const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../extension/core.js");
const context = { distro: "humble", pkg: "action_msgs", type: "msg", name: "GoalInfo" };
const base = "https://docs.ros.org/en/humble/p/";
const parse = source => core.parseDefinition(source, context)[0].lines;

test("builds all three navigation levels and normalizes submitted values", () => {
  assert.equal(core.destination({ distro: "", type: "msg" }).url, "https://docs.ros.org/en/rolling/p/");
  assert.equal(core.destination({ distro: "humble", pkg: "action_msgs", type: "srv" }).url, `${base}action_msgs/`);
  assert.deepEqual(core.destination({ distro: " humble ", pkg: " action_msgs ", type: " srv ", name: " CancelGoal " }), {
    ok: true, url: `${base}action_msgs/srv/CancelGoal.html`,
    values: { distro: "humble", pkg: "action_msgs", type: "srv", name: "CancelGoal" },
  });
  assert.equal(core.destination({ distro: "future_distro", type: "msg" }).ok, true);
});

test("rejects incomplete input, unknown kinds, and URL/path injection", () => {
  for (const input of [
    { name: "Pose" }, { pkg: "../sensor_msgs" }, { distro: "https://evil.example" },
    { distro: "humble/x" }, { type: "action" }, { type: "" },
    { pkg: "sensor_msgs", name: "PointCloud2?x=y" }, { pkg: "sensor_msgs", name: "point_cloud" },
  ]) assert.equal(core.destination({ ...core.DEFAULTS, ...input }).ok, false, JSON.stringify(input));
});

test("recognizes canonical documentation URLs and ignores queries/fragments", () => {
  assert.deepEqual(core.parseUrl(`${base}action_msgs/msg/GoalInfo.html?x=1#source`), context);
  assert.deepEqual(core.parseUrl(`${base}action_msgs/`), { ...context, name: "" });
  assert.deepEqual(core.parseUrl(base), { ...context, pkg: "", name: "" });
  for (const url of [
    "about:blank", "https://docs.ros.org.evil.example/en/humble/p/action_msgs/",
    "http://docs.ros.org/en/humble/p/action_msgs/", `${base}action_msgs/action/Goal.html`,
    `${base}action_msgsmsg/GoalInfo.html`, `${base}action_msgs/interfaces/msg/GoalInfo.html`,
    "https://docs.ros2.org/foxy/api/sensor_msgs/msg/PointCloud2.html",
    "https://user@docs.ros.org/en/humble/p/", "https://docs.ros.org/en/ros2_packages/humble/api/std_msgs/",
  ]) assert.equal(core.parseUrl(url), null, url);
});

test("current page wins over saved values; invalid saved values fall back to defaults", () => {
  assert.deepEqual(core.initialValues(base, context), { ...core.DEFAULTS, distro: "humble" });
  assert.deepEqual(core.initialValues("about:blank", context), context);
  assert.deepEqual(core.initialValues("about:blank", { type: "action" }), core.DEFAULTS);
  assert.deepEqual(core.initialValues(undefined, undefined), core.DEFAULTS);
  assert.deepEqual(core.initialValues(undefined, null), core.DEFAULTS);
});

test("links qualified and same-package types while preserving array bounds", () => {
  const lines = parse("geometry_msgs/Pose pose # current pose\nGoalInfo[] goals\nGoalInfo[2] pair\nGoalInfo[<=10] bounded");
  assert.equal(lines[0].href, `${base}geometry_msgs/msg/Pose.html`);
  for (const line of lines.slice(1)) assert.equal(line.href, `${base}action_msgs/msg/GoalInfo.html`);
  assert.equal(lines[2].linkText, "GoalInfo");
  assert.equal(lines[2].tail, "[2] pair");
  assert.equal(lines[3].tail, "[<=10] bounded");
});

test("retains primitive declarations, bounded strings, constants, and defaults without links", () => {
  const source = "  int32\tcount   10\nstring<=32 label\nwstring<=8[] names\nuint8 MODE = 1\nfloat64[3] values [1, 2, 3]";
  const lines = parse(source);
  assert.deepEqual(lines.map(line => line.href), Array(5).fill(null));
  assert.deepEqual(lines.map(line => line.text), [
    "int32 count 10", "string<=32 label", "wstring<=8[] names", "uint8 MODE=1", "float64[3] values [1, 2, 3]",
  ]);
});

test("comments and token spacing do not corrupt quoted values or escapes", () => {
  const lines = parse('string label "a  # b" # outside\nstring other \'it\\\'s # here\' # outside\n# comment\n\n');
  assert.deepEqual(lines.map(line => line.text), ['string label "a  # b"', "string other 'it\\'s # here'"]);
  assert.equal(parse('string label "unterminated # literal')[0].text, 'string label "unterminated # literal');
});

test("unknown syntax is retained without speculative hyperlinks", () => {
  for (const line of ["sequence<GoalInfo> goals", "GoalInfo[bad] goals", "GoalInfo NAME=1", "GoalInfo goal ???", "GoalInfo goal!", "pkg/msg/GoalInfo goal", "GoalInfo goals_", "<script>alert(1)</script>"]) {
    assert.deepEqual(parse(line), [{ text: line, href: null }]);
  }
});

test("splits service sections, preserves constants, and links fields to msg", () => {
  const groups = core.parseDefinition("GoalInfo goal_info\r\n---\r\nint8 ERROR_NONE=0\r\nGoalInfo[] goals_canceling", { ...context, type: "srv" });
  assert.deepEqual(groups.map(group => group.label), ["Request", "Response"]);
  assert.equal(groups[0].lines[0].href, `${base}action_msgs/msg/GoalInfo.html`);
  assert.equal(groups[1].lines[1].href, `${base}action_msgs/msg/GoalInfo.html`);
  assert.equal(groups[1].lines[0].text, "int8 ERROR_NONE=0");
});

test("empty definitions and empty service halves are valid", () => {
  assert.deepEqual(parse("# empty\n"), []);
  assert.deepEqual(core.parseDefinition("---", { ...context, type: "srv" }), [
    { label: "Request", lines: [] }, { label: "Response", lines: [] },
  ]);
});

test("malformed service sections stay readable without guessed structure", () => {
  for (const source of ["GoalInfo info", "GoalInfo info\n---\n---"]) {
    const groups = core.parseDefinition(source, { ...context, type: "srv" });
    assert.equal(groups.length, 1);
    assert.equal(groups[0].label, "");
    assert.ok(groups[0].lines.every(line => line.href === null));
  }
});

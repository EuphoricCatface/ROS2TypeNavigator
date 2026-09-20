(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({ distro: "rolling", pkg: "", type: "msg", name: "" });
  const ORIGIN = "https://docs.ros.org";
  const IDENTIFIER = /^[a-z][a-z0-9_]*$/;
  const MESSAGE_NAME = /^[A-Z][A-Za-z0-9]*$/;
  const PRIMITIVES = new Set([
    "bool", "byte", "char", "float32", "float64", "int8", "int16", "int32", "int64",
    "uint8", "uint16", "uint32", "uint64", "string", "wstring",
  ]);

  function destination(input = {}) {
    input ??= {};
    const values = Object.fromEntries(Object.keys(DEFAULTS).map(key => [
      key, typeof input[key] === "string" ? input[key].trim() : "",
    ]));
    values.distro ||= DEFAULTS.distro;
    function invalid(field, error) { return { ok: false, field, error }; }
    if (!IDENTIFIER.test(values.distro)) {
      return invalid("distro", "Distro must start with a lowercase letter and contain only lowercase letters, digits, or underscores.");
    }
    if (values.pkg && !IDENTIFIER.test(values.pkg)) {
      return invalid("pkg", "Package must start with a lowercase letter and contain only lowercase letters, digits, or underscores.");
    }
    if (!["msg", "srv"].includes(values.type)) {
      return invalid("type", "Choose Message (msg) or Service (srv).");
    }
    if (values.name && !values.pkg) return invalid("pkg", "Enter a package when an interface name is supplied.");
    if (values.name && !MESSAGE_NAME.test(values.name)) {
      return invalid("name", "Name must start with an uppercase letter and contain only letters and digits.");
    }
    let url = `${ORIGIN}/en/${values.distro}/p/`;
    if (values.pkg) url += `${values.pkg}/`;
    if (values.name) url += `${values.type}/${values.name}.html`;
    return { ok: true, values, url };
  }

  function parseUrl(value) {
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.origin !== ORIGIN || url.username || url.password) return null;
    const match = /^\/en\/([a-z][a-z0-9_]*)\/p\/(?:([a-z][a-z0-9_]*)\/(?:(msg|srv)\/([A-Z][A-Za-z0-9]*)\.html)?)?$/.exec(url.pathname);
    if (!match) return null;
    return { distro: match[1], pkg: match[2] || "", type: match[3] || "msg", name: match[4] || "" };
  }

  function initialValues(url, saved) {
    const current = parseUrl(url);
    if (current) return current;
    const previous = destination(saved);
    return previous.ok ? previous.values : { ...DEFAULTS };
  }

  // Keep literal whitespace and hashes intact. Unterminated quotes are not guessed at.
  function withoutComment(line) {
    let quote = "";
    let escaped = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (quote) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === quote) quote = "";
      } else if (char === "'" || char === '"') quote = char;
      else if (char === "#") return { text: line.slice(0, i).trim(), valid: true };
    }
    return { text: line.trim(), valid: !quote };
  }

  function parseType(token) {
    const match = /^([^\[\]]+)(\[(?:[1-9][0-9]*|<=[1-9][0-9]*)?\])?$/.exec(token);
    if (!match) return null;
    const [, base, suffix = ""] = match;
    const primitive = PRIMITIVES.has(base) || /^(?:w?string)<=[1-9][0-9]*$/.test(base);
    if (primitive) return { base, suffix, primitive: true };
    const complex = /^(?:([a-z][a-z0-9_]*)\/)?([A-Z][A-Za-z0-9]*)$/.exec(base);
    if (!complex) return null;
    return { base, suffix, primitive: false, pkg: complex[1], name: complex[2] };
  }

  function parseLine(raw, context) {
    const cleaned = withoutComment(raw);
    const text = cleaned.text;
    if (!text) return null;
    const plain = { text, href: null };
    if (!cleaned.valid) return plain;
    const match = /^(\S+)[ \t]+([A-Za-z][A-Za-z0-9_]*)(.*)$/.exec(text);
    if (!match) return plain;
    const [, token, name, rest] = match;
    const type = parseType(token);
    if (!type) return plain;
    const constant = /^[ \t]*=/.test(rest);
    if (constant) {
      if (!type.primitive || type.suffix || !/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/.test(name)) return plain;
    } else {
      if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/.test(name) || (rest && !/^[ \t]/.test(rest))) return plain;
      // Complex field defaults are outside the supported grammar.
      if (!type.primitive && rest.trim()) return plain;
    }
    const remainder = constant ? rest.replace(/^[ \t]*=[ \t]*/, "=") : (rest.trim() ? ` ${rest.trim()}` : "");
    const formatted = `${token} ${name}${remainder}`;
    if (type.primitive) return { text: formatted, href: null };
    const target = destination({ distro: context.distro, pkg: type.pkg || context.pkg, type: "msg", name: type.name });
    if (!target.ok) return plain;
    return { text: formatted, href: target.url, linkText: type.base, tail: `${type.suffix} ${name}` };
  }

  function parseDefinition(source, context) {
    const lines = source.split(/\r\n|\n|\r/);
    const separators = lines.flatMap((line, index) => withoutComment(line).text === "---" ? [index] : []);
    if (context.type === "srv") {
      if (separators.length !== 1) {
        // Preserve an unsupported service layout without implying a request/response split.
        return [{ label: "", lines: lines.map(line => ({ text: line.trim(), href: null })).filter(line => line.text) }];
      }
      return [
        { label: "Request", lines: lines.slice(0, separators[0]).map(line => parseLine(line, context)).filter(Boolean) },
        { label: "Response", lines: lines.slice(separators[0] + 1).map(line => parseLine(line, context)).filter(Boolean) },
      ];
    }
    return [{ label: "", lines: lines.map(line => parseLine(line, context)).filter(Boolean) }];
  }

  const api = { DEFAULTS, destination, parseUrl, initialValues, parseDefinition };
  root.ROSTypeNavigator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);

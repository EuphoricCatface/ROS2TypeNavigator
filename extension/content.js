(function (root) {
  "use strict";
  const SECTION_ID = "ros2-type-navigator-definition";

  function findSource(doc) {
    const main = doc.querySelector("main, [role='main']");
    if (!main) return null;
    const candidates = [];
    for (const label of main.querySelectorAll("p, h2, h3, h4")) {
      // Sphinx adds a permalink to headings; it is not part of the label.
      const copy = label.cloneNode(true);
      copy.querySelectorAll(".headerlink").forEach(link => link.remove());
      if (copy.textContent.trim() !== "Source") continue;
      const block = label.nextElementSibling;
      if (!block) continue;
      const pres = block.matches("pre") ? [block] : block.querySelectorAll("pre");
      if (pres.length === 1 && (block.matches("pre") || block.matches("div[class*='highlight']"))) {
        candidates.push({ block, pre: pres[0] });
      }
    }
    return candidates.length === 1 ? candidates[0] : null;
  }

  function enhance(doc, url) {
    const core = root.ROSTypeNavigator;
    const context = core.parseUrl(url);
    if (!context?.name || doc.getElementById(SECTION_ID)) return false;
    const source = findSource(doc);
    if (!source) return false;

    const section = doc.createElement("section");
    section.id = SECTION_ID;
    section.setAttribute("aria-labelledby", `${SECTION_ID}-title`);
    const heading = doc.createElement("h2");
    heading.id = `${SECTION_ID}-title`;
    heading.textContent = "Navigable definition";
    section.append(heading);
    for (const group of core.parseDefinition(source.pre.textContent, context)) {
      if (group.label) {
        const label = doc.createElement("h3");
        label.textContent = group.label;
        section.append(label);
      }
      const pre = doc.createElement("pre");
      const code = doc.createElement("code");
      if (!group.lines.length) code.textContent = "(empty)";
      for (const [index, line] of group.lines.entries()) {
        if (index) code.append("\n");
        if (line.href) {
          const link = doc.createElement("a");
          link.href = line.href;
          link.textContent = line.linkText;
          code.append(link, line.tail);
        } else code.append(line.text);
      }
      pre.append(code);
      section.append(pre);
    }
    source.block.after(section);
    return true;
  }

  root.ROSTypeNavigatorPage = { enhance, findSource };
  if (root.document && root.location) enhance(root.document, root.location.href);
})(globalThis);

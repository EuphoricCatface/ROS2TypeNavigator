/* Copyright (C) 2026 Seongyong Park and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
(function (root) {
  "use strict";
  const core = root.ROSTypeNavigator;
  const STORAGE_KEY = "lastNavigation";

  function createAdapter(extension = root.browser || root.chrome) {
    return {
      async currentUrl() {
        const [tab] = await extension.tabs.query({ active: true, currentWindow: true });
        return tab?.url;
      },
      async readSaved() {
        return (await extension.storage.local.get(STORAGE_KEY))[STORAGE_KEY];
      },
      async save(values) {
        await extension.storage.local.set({ [STORAGE_KEY]: values });
      },
      async createTab(url) {
        return extension.tabs.create({ url, active: false });
      },
      async activateTab(id) {
        return extension.tabs.update(id, { active: true });
      },
    };
  }

  async function initialize(api) {
    const [current, saved] = await Promise.allSettled([api.currentUrl(), api.readSaved()]);
    return core.initialValues(current.status === "fulfilled" ? current.value : undefined,
      saved.status === "fulfilled" ? saved.value : undefined);
  }

  function createSubmitter(api, close) {
    let submitting = false;
    return async function submit(input) {
      if (submitting) return { ok: false, busy: true };
      const target = core.destination(input);
      if (!target.ok) return target;
      submitting = true;
      try {
        let tab;
        try { tab = await api.createTab(target.url); }
        catch { return { ok: false, error: "Could not open the documentation. Please try again." }; }
        // Activating the new tab closes an action popup. Save before activation,
        // after creation succeeds, so neither popup teardown nor a failed open loses state.
        try { await api.save(target.values); } catch { /* Navigation does not depend on storage. */ }
        try { await api.activateTab(tab.id); }
        catch { return { ok: false, error: "The documentation opened in a background tab, but could not be selected. Switch to that tab to view it." }; }
        close();
        return { ok: true };
      } finally { submitting = false; }
    };
  }

  async function mount(doc, api, close) {
    const form = doc.getElementById("navigator");
    const fields = doc.getElementById("fields");
    const button = doc.getElementById("go");
    const error = doc.getElementById("error");
    const controls = Object.fromEntries(Object.keys(core.DEFAULTS).map(key => [key, doc.getElementById(key)]));
    const values = await initialize(api);
    for (const [key, value] of Object.entries(values)) controls[key].value = value;
    // Drafts belong only to this popup instance; only submitted values are saved.
    const names = { msg: "", srv: "" };
    let selectedType = controls.type.value;
    names[selectedType] = controls.name.value;
    function updatePlaceholders() {
      const example = controls.type.value === "srv"
        ? { pkg: "nav_msgs", name: "SetMap" }
        : { pkg: "visualization_msgs", name: "Marker" };
      controls.pkg.placeholder = `ex: ${example.pkg}`;
      controls.name.placeholder = `ex: ${example.name}`;
    }
    updatePlaceholders();
    controls.type.addEventListener("change", () => {
      names[selectedType] = controls.name.value;
      selectedType = controls.type.value;
      controls.name.value = names[selectedType];
      updatePlaceholders();
      clearError();
    });
    fields.disabled = false;
    const submit = createSubmitter(api, close);

    function clearError() {
      error.hidden = true;
      error.textContent = "";
      for (const control of Object.values(controls)) {
        control.removeAttribute("aria-invalid");
        const description = (control.getAttribute("aria-describedby") || "").split(" ").filter(id => id && id !== "error");
        if (description.length) control.setAttribute("aria-describedby", description.join(" "));
        else control.removeAttribute("aria-describedby");
      }
    }
    form.addEventListener("input", clearError);
    form.addEventListener("submit", async event => {
      event.preventDefault();
      if (button.disabled) return;
      clearError();
      button.disabled = true;
      try {
        const result = await submit(Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value])));
        if (!result.ok && !result.busy) {
          error.textContent = result.error;
          error.hidden = false;
          if (result.field) {
            const control = controls[result.field];
            control.setAttribute("aria-invalid", "true");
            control.setAttribute("aria-describedby", `${control.getAttribute("aria-describedby") || ""} error`.trim());
            control.focus();
          }
        }
      } finally { button.disabled = false; }
    });
  }

  const api = { createAdapter, initialize, createSubmitter, mount };
  root.ROSTypeNavigatorPopup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root.document && (root.browser?.runtime?.id || root.chrome?.runtime?.id)) {
    mount(root.document, createAdapter(), () => root.close());
  }
})(globalThis);

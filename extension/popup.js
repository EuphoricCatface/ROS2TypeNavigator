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
      async readEnabled() {
        return (await extension.storage.local.get("reformatEnabled")).reformatEnabled !== false;
      },
      async setEnabled(enabled) {
        await extension.storage.local.set({ reformatEnabled: enabled });
      },
      async createTab(url) {
        return extension.tabs.create({ url, active: false });
      },
      async navigateCurrent(url) {
        return extension.tabs.update({ url });
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
    return async function submit(input, newTab = false) {
      if (submitting) return { ok: false, busy: true };
      const target = core.destination(input);
      if (!target.ok) return target;
      submitting = true;
      try {
        if (newTab) {
          try { await api.createTab(target.url); }
          catch { return { ok: false, error: "Could not open the documentation. Please try again." }; }
          try { await api.save(target.values); } catch { /* Navigation does not depend on storage. */ }
        } else {
          // Navigating the active tab can tear down its action popup. Save first.
          try { await api.save(target.values); } catch { /* Navigation does not depend on storage. */ }
          try { await api.navigateCurrent(target.url); }
          catch { return { ok: false, error: "Could not open the documentation in this tab. Please try again." }; }
        }
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
    const toggle = doc.getElementById("reformat-enabled");
    const toggleStatus = doc.getElementById("reformat-status");
    let enabled;
    try {
      enabled = await api.readEnabled();
      toggle.checked = enabled;
      toggle.disabled = false;
    } catch {
      toggleStatus.textContent = "Could not load the reformatting setting. Reopen the popup to try again.";
      toggleStatus.hidden = false;
    }
    toggle.addEventListener("change", async () => {
      toggle.disabled = true;
      toggleStatus.hidden = true;
      try {
        await api.setEnabled(toggle.checked);
        enabled = toggle.checked;
      } catch {
        toggle.checked = enabled;
        toggleStatus.textContent = "Could not save the reformatting setting. Please try again.";
        toggleStatus.hidden = false;
      } finally { toggle.disabled = false; }
    });
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
    async function navigate(newTab = false) {
      if (button.disabled) return;
      clearError();
      button.disabled = true;
      try {
        const result = await submit(Object.fromEntries(Object.entries(controls).map(([key, input]) => [key, input.value])), newTab);
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
    }
    form.addEventListener("submit", event => {
      event.preventDefault();
      navigate();
    });
    button.addEventListener("mousedown", event => {
      if (event.button === 1) event.preventDefault();
    });
    button.addEventListener("auxclick", event => {
      if (event.button !== 1) return;
      event.preventDefault();
      navigate(true);
    });
  }

  const api = { createAdapter, initialize, createSubmitter, mount };
  root.ROSTypeNavigatorPopup = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root.document && (root.browser?.runtime?.id || root.chrome?.runtime?.id)) {
    mount(root.document, createAdapter(), () => root.close());
  }
})(globalThis);

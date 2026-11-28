// Shared native UI behavior. External labels are always assigned as text.
(() => {
  const { t } = DucoroI18n;
  const make = (tag, text, className) => {
    const n = document.createElement(tag);
    if (text !== undefined) DucoroI18n.setText(n, text);
    if (className) n.className = className;
    return n;
  };
  let sequence = 0;

  function reveal(node) {
    if (!node) return;
    const panel = node.closest(".tab-content");
    if (panel?.hidden) {
      document.querySelector(`[data-tab="${panel.id}"]`)?.click();
    }
    for (let p = node.parentElement; p; p = p.parentElement) {
      if (p.tagName === "DETAILS") p.open = true;
    }
    node.tabIndex = -1;
    node.scrollIntoView({
      block: "center",
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth",
    });
    node.focus({ preventScroll: true });
    node.classList.add("located");
    setTimeout(() => node.classList.remove("located"), 2500);
  }

  function fieldError(input, text) {
    input.setAttribute("aria-invalid", "true");
    let error = document.getElementById(input.dataset.errorId);
    if (!error) {
      error = make("p", undefined, "field-error");
      error.id = `field-error-${++sequence}`;
      error.setAttribute("role", "alert");
      input.after(error);
      input.dataset.errorId = error.id;
      input.setAttribute("aria-describedby", error.id);
    }
    DucoroI18n.setText(error, text);
    input.addEventListener(
      "input",
      () => {
        input.removeAttribute("aria-invalid");
        error.remove();
      },
      { once: true },
    );
    reveal(input);
  }

  function searchable(list, title) {
    const bar = make("div", undefined, "resource-search");
    const search = make("input");
    const onlyLabel = make("label", undefined, "choice");
    const only = make("input");
    const count = make("p");
    search.type = "search";
    DucoroI18n.setAttribute(search, "placeholder", t`搜索${title}`);
    DucoroI18n.setAttribute(search, "aria-label", t`搜索${title}`);
    only.type = "checkbox";
    onlyLabel.append(only, make("span", t("只看已选")));
    bar.append(search, onlyLabel, count);
    list.before(bar);

    const update = () => {
      const rows = [...list.children].filter((x) => x.matches("label.choice"));
      const query = search.value.toLowerCase();
      let visible = 0;
      for (const row of rows) {
        row.hidden =
          !row.textContent.toLowerCase().includes(query) ||
          (only.checked && !row.querySelector("input")?.checked);
        if (!row.hidden) visible++;
      }
      const checkedCount = rows.filter((x) => x.querySelector("input")?.checked).length;
      DucoroI18n.setText(count, t`已选 ${checkedCount} / ${rows.length} 项 · 显示 ${visible} 项`);
    };

    search.oninput = only.onchange = update;
    list.addEventListener("change", update);
    update();
    return update;
  }

  // Shared native dialog setup: title binding, initial focus, and focus return.
  function openDialog(dialog, { focusTarget } = {}) {
    const opener = document.activeElement;
    if (!dialog.className) dialog.className = "preview-dialog";
    const title = dialog.querySelector("h2,h3");
    if (title) {
      title.id ||= `dialog-title-${++sequence}`;
      dialog.setAttribute("aria-labelledby", title.id);
    }
    dialog.addEventListener(
      "close",
      () => {
        if (opener?.isConnected) opener.focus({ preventScroll: true });
      },
      { once: true },
    );
    dialog.showModal();
    const first =
      focusTarget ??
      dialog.querySelector("button:not(:disabled),input:not(:disabled),select:not(:disabled)");
    first?.focus();
  }

  function confirmDialog({
    title,
    body = [],
    cancelLabel = t("取消"),
    confirmLabel = t("确认"),
    confirmClass = "primary",
    danger = false,
  } = {}) {
    return new Promise((resolve) => {
      const dialog = make("dialog", undefined, "preview-dialog");
      dialog.append(make("h2", title));
      for (const item of body) {
        dialog.append(typeof item === "string" ? make("p", item) : item);
      }
      const footer = make("footer", undefined, "button-group action-row");
      const cancel = make("button", cancelLabel, "secondary");
      const confirm = make(
        "button",
        confirmLabel,
        danger ? `${confirmClass} danger` : confirmClass,
      );
      cancel.type = confirm.type = "button";
      cancel.addEventListener("click", () => dialog.close());
      confirm.addEventListener("click", () => dialog.close("confirm"));
      footer.append(cancel, confirm);
      dialog.append(footer);
      dialog.addEventListener(
        "close",
        () => {
          const accepted = dialog.returnValue === "confirm";
          dialog.remove();
          resolve(accepted);
        },
        { once: true },
      );
      document.body.append(dialog);
      openDialog(dialog, { focusTarget: cancel });
    });
  }

  function preserveFocus(root, work) {
    const active = document.activeElement;
    if (!root.contains(active)) return work();
    const row = active.closest("[data-bot-id],[data-task-id]");
    const key = row?.dataset.botId ?? row?.dataset.taskId;
    const controls = [...(row?.querySelectorAll("button,input,select,textarea,summary") ?? [])];
    const controlId = active.id;
    const controlName = active.getAttribute("aria-label");
    const index = controls.indexOf(active);
    const start = active.selectionStart;
    const end = active.selectionEnd;

    work();

    const roots = [
      ...(root.matches("[data-bot-id],[data-task-id]") ? [root] : []),
      ...root.querySelectorAll("[data-bot-id],[data-task-id]"),
    ];
    const newRow = roots.find((x) => (x.dataset.botId ?? x.dataset.taskId) === key);
    const candidates = [
      ...(newRow?.querySelectorAll("button,input,select,textarea,summary") ?? []),
    ];
    const next =
      candidates.find(
        (n) =>
          (controlId && n.id === controlId) ||
          (controlName && n.getAttribute("aria-label") === controlName),
      ) ?? candidates[index];
    next?.focus({ preventScroll: true });
    if (
      typeof start === "number" &&
      next?.setSelectionRange &&
      ["text", "search"].includes(next.type)
    ) {
      next.setSelectionRange(start, end);
    }
  }

  function updateAccent() {
    const probe = make("span");
    probe.style.color = "var(--accent)";
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    document.body.append(probe);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.fillStyle = getComputedStyle(probe).color;
    ctx.fillRect(0, 0, 1, 1);
    const rgb = [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
    probe.remove();

    const luminance = (channels) =>
      channels
        .map((v) => {
          v /= 255;
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        })
        .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
    const bg = luminance(rgb);
    const dark = luminance([16, 24, 32]);
    const contrast = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    document.documentElement.style.setProperty(
      "--on-accent",
      contrast(bg, dark) >= contrast(bg, 1) ? "#101820" : "#ffffff",
    );
  }

  function errorText(error) {
    if (error?.name === "ReferenceError") {
      return t("页面组件加载不完整，请重新打开 Ducoro 页面。");
    }
    return error?.localizedMessage ?? error?.message ?? t("操作未完成，请稍后重试。");
  }

  globalThis.DucoroComponents = {
    errorText,
    make,
    reveal,
    fieldError,
    searchable,
    preserveFocus,
    updateAccent,
    openDialog,
    confirmDialog,
  };

  document.addEventListener("DOMContentLoaded", () => {
    updateAccent();
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateAccent);
    const scope = document.querySelector("#resources .scope-grid")?.closest("section");
    if (scope) {
      const wrapper = make("details", undefined, "card");
      const summary = make("summary", t("同步作用域与分配说明"));
      scope.before(wrapper);
      wrapper.append(summary, scope);
      scope.className = "";
    }
    const tabs = [...document.querySelectorAll("nav.tabs [data-tab]")];
    // Keep existing button-navigation semantics; add predictable arrow traversal.
    tabs.forEach((tab, index) =>
      tab.addEventListener("keydown", (event) => {
        let next;
        if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
        if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
        if (event.key === "Home") next = 0;
        if (event.key === "End") next = tabs.length - 1;
        if (next !== undefined) {
          event.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }
      }),
    );
  });
})();

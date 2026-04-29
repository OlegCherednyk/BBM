(function () {
  const states = new WeakMap();

  function closeAll(except) {
    document.querySelectorAll(".custom-select.is-open").forEach((node) => {
      if (node !== except) node.classList.remove("is-open");
    });
  }

  function getVariant(select) {
    if (select.closest(".admin-field")) return "admin";
    if (select.closest(".form-group")) return "form";
    if (select.classList.contains("schedule-calendar-section__select")) return "schedule";
    return "default";
  }

  function render(select) {
    const state = states.get(select);
    if (!state) return;
    const { menu, trigger, wrapper } = state;

    const options = Array.from(select.options);
    const selectedOption = options.find((o) => o.selected) || options[0] || null;

    trigger.textContent = selectedOption ? selectedOption.textContent : "";
    trigger.classList.toggle("is-placeholder", !selectedOption || selectedOption.value === "");
    trigger.disabled = !!select.disabled;
    wrapper.classList.toggle("is-disabled", !!select.disabled);

    menu.innerHTML = "";
    options.forEach((opt, index) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "custom-select__option";
      btn.setAttribute("role", "option");
      btn.dataset.value = opt.value;
      btn.textContent = opt.textContent || "";
      if (opt.disabled) btn.disabled = true;
      if (opt.selected) {
        btn.classList.add("is-selected");
        btn.setAttribute("aria-selected", "true");
      } else {
        btn.setAttribute("aria-selected", "false");
      }
      btn.addEventListener("click", () => {
        if (opt.disabled) return;
        select.selectedIndex = index;
        render(select);
        wrapper.classList.remove("is-open");
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });
      menu.appendChild(btn);
    });
  }

  function enhanceSelect(select) {
    if (!select || select.dataset.customSelectReady === "true") return;
    if (select.multiple || select.size > 1) return;

    select.dataset.customSelectReady = "true";
    select.classList.add("custom-select__native");

    const wrapper = document.createElement("div");
    wrapper.className = "custom-select";
    wrapper.dataset.variant = getVariant(select);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "custom-select__menu";
    menu.setAttribute("role", "listbox");

    const parent = select.parentNode;
    parent.insertBefore(wrapper, select);
    wrapper.appendChild(select);
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);

    states.set(select, { wrapper, trigger, menu });
    render(select);

    trigger.addEventListener("click", () => {
      if (select.disabled) return;
      const open = wrapper.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", String(open));
      if (open) closeAll(wrapper);
    });

    select.addEventListener("change", () => render(select));

    const obs = new MutationObserver(() => render(select));
    obs.observe(select, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "selected"],
    });
  }

  function init(root = document) {
    root.querySelectorAll("select").forEach(enhanceSelect);
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-select")) closeAll(null);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll(null);
  });

  const documentObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        if (node.matches("select")) enhanceSelect(node);
        node.querySelectorAll?.("select").forEach(enhanceSelect);
      });
    }
  });

  documentObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  window.CustomSelects = {
    init,
    refreshAll: () => init(document),
    refreshSelect: (select) => render(select),
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => init(document));
  } else {
    init(document);
  }
})();

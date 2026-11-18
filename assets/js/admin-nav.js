/** Grouped admin navigation: top bar on wide screens, bottom bar on phones. */

export const ADMIN_NAV_GROUPS = [
  {
    id: "analytics",
    label: "Аналітика",
    icon: "chart",
    pages: [{ id: "stats", href: "stats.html", label: "Аналітика" }],
  },
  {
    id: "schedule",
    label: "Розклад",
    icon: "calendar",
    pages: [
      { id: "lessons", href: "lessons.html", label: "Заняття" },
      { id: "votes", href: "votes.html", label: "Голосування" },
      { id: "events", href: "events.html", label: "Івенти" },
    ],
  },
  {
    id: "people",
    label: "Люди",
    icon: "users",
    pages: [
      { id: "students", href: "students.html", label: "Учні" },
      { id: "subscriptions", href: "subscriptions.html", label: "Абонементи" },
      { id: "teachers", href: "teachers.html", label: "Викладачі" },
    ],
  },
  {
    id: "studio",
    label: "Студія",
    icon: "home",
    pages: [
      { id: "places", href: "places.html", label: "Місця" },
      { id: "prices", href: "prices.html", label: "Ціни" },
    ],
  },
];

const ICON_PATHS = {
  chart: ["M3 3v18h18", "M7 15l4-4 3 3 5-6"],
  calendar: ["M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z", "M8 3v4", "M16 3v4", "M3 10h18"],
  users: [
    "M9 11.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    "M2.5 20c.6-3.6 3.3-5.6 6.5-5.6s5.9 2 6.5 5.6",
    "M16 4.6a3.5 3.5 0 0 1 0 6.8",
    "M18.5 14.8c1.7.8 2.8 2.6 3 5.2",
  ],
  home: ["M3 11l9-7 9 7", "M5 10v10h14V10", "M10 20v-5h4v5"],
};

const LAST_PAGE_KEY = "bbm:admin-nav:last-page";
/** Set when leaving for another group, so the next page plays the sub-row entrance. */
const ENTER_KEY = "bbm:admin-nav:enter-group";
const SWIPE_MIN_PX = 48;

function groupOfPage(pageId) {
  return ADMIN_NAV_GROUPS.find((g) => g.pages.some((p) => p.id === pageId)) ?? null;
}

function readLastPages() {
  try {
    return JSON.parse(localStorage.getItem(LAST_PAGE_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

function rememberPage(pageId) {
  const group = groupOfPage(pageId);
  if (!group) return;
  const last = readLastPages();
  last[group.id] = pageId;
  try {
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify(last));
  } catch {
    /* private mode */
  }
}

/** Group tab opens the page last visited in that group, so switching back keeps your place. */
function groupEntryPage(group) {
  const lastId = readLastPages()[group.id];
  return group.pages.find((p) => p.id === lastId) ?? group.pages[0];
}

function makeIcon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("admin-gnav__icon");
  for (const d of ICON_PATHS[name] ?? []) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

function buildTabs(activeGroupId, pageId) {
  const track = document.createElement("div");
  track.className = "admin-gnav__tabs";

  for (const group of ADMIN_NAV_GROUPS) {
    const entry = groupEntryPage(group);
    const a = document.createElement("a");
    a.className = "admin-gnav__tab";
    a.href = entry.href;
    a.dataset.group = group.id;
    a.dataset.page = entry.id;
    a.title = group.label;
    const label = document.createElement("span");
    label.className = "admin-gnav__label";
    label.textContent = group.label;
    a.append(makeIcon(group.icon), label);
    track.appendChild(a);
  }
  setActiveTab(track, activeGroupId, pageId);
  return track;
}

function setActiveTab(track, groupId, pageId) {
  for (const tab of track.querySelectorAll(".admin-gnav__tab")) {
    const on = tab.dataset.group === groupId;
    tab.classList.toggle("is-active", on);
    if (!on) tab.removeAttribute("aria-current");
    else tab.setAttribute("aria-current", tab.dataset.page === pageId ? "page" : "true");
  }
}

function fillSubs(subs, group, pageId) {
  subs.replaceChildren();
  const pages = group?.pages ?? [];
  subs.hidden = pages.length < 2;
  if (subs.hidden) return;
  const thumb = document.createElement("span");
  thumb.className = "admin-gnav__thumb";
  thumb.setAttribute("aria-hidden", "true");
  subs.appendChild(thumb);
  pages.forEach((page, i) => {
    const a = document.createElement("a");
    a.className = "admin-gnav__sub";
    a.href = page.href;
    a.dataset.page = page.id;
    a.dataset.group = group.id;
    a.style.setProperty("--i", String(i));
    a.textContent = page.label;
    if (page.id === pageId) {
      a.classList.add("is-active");
      a.setAttribute("aria-current", "page");
    }
    subs.appendChild(a);
  });
  placeThumb(subs, ".admin-gnav__sub.is-active");
}

function setActiveSub(subs, pageId) {
  for (const a of subs.querySelectorAll(".admin-gnav__sub")) {
    const on = a.dataset.page === pageId;
    a.classList.toggle("is-active", on);
    if (on) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
  placeThumb(subs, ".admin-gnav__sub.is-active");
}

function playEntrance(subs) {
  subs.classList.remove("is-entering");
  void subs.offsetWidth;
  subs.classList.add("is-entering");
}

function placeThumb(track, activeSelector) {
  const thumb = track.querySelector(":scope > .admin-gnav__thumb");
  const active = track.querySelector(activeSelector);
  if (!thumb) return;
  if (!active || !active.offsetWidth) {
    thumb.classList.toggle("is-empty", !active);
    return;
  }
  thumb.classList.remove("is-empty");
  const firstPlacement = !thumb.classList.contains("is-placed");
  if (firstPlacement) thumb.style.transition = "none";
  thumb.style.setProperty("--x", `${active.offsetLeft}px`);
  thumb.style.setProperty("--w", `${active.offsetWidth}px`);
  if (firstPlacement) {
    void thumb.offsetWidth;
    thumb.style.transition = "";
    thumb.classList.add("is-placed");
  }
}

function buildNav(variant, groupId, pageId) {
  const root = document.createElement("div");
  root.className = `admin-gnav admin-gnav--${variant}`;
  const subs = document.createElement("div");
  subs.className = "admin-gnav__subs";
  const tabs = buildTabs(groupId, pageId);
  fillSubs(subs, groupOfPage(pageId), pageId);
  // Bottom bar keeps the sub-row above the thumb-reachable group tabs.
  if (variant === "bottom") root.append(subs, tabs);
  else root.append(tabs, subs);
  return root;
}

function refreshThumbs(root) {
  const subs = root.querySelector(".admin-gnav__subs");
  if (subs) placeThumb(subs, ".admin-gnav__sub.is-active");
}

/**
 * @param {{ pageId: string, topHost: HTMLElement | null }} opts
 * @returns {{ setVisible: (visible: boolean) => void }}
 */
export function mountAdminNav({ pageId, topHost }) {
  const currentGroup = groupOfPage(pageId);
  const groupId = currentGroup?.id ?? "";
  rememberPage(pageId);

  const top = buildNav("top", groupId, pageId);
  topHost?.replaceChildren(top);

  const bottom = document.createElement("nav");
  bottom.id = "adminBottomNav";
  bottom.className = "admin-gnav-dock admin-hide";
  bottom.setAttribute("aria-label", "Розділи адмінки");
  bottom.appendChild(buildNav("bottom", groupId, pageId));
  document.body.appendChild(bottom);

  const roots = [top, bottom.firstElementChild].filter(Boolean);

  const markGroupEnter = (targetGroupId) => {
    if (!targetGroupId || targetGroupId === groupId) return;
    try {
      sessionStorage.setItem(ENTER_KEY, targetGroupId);
    } catch {
      /* private mode */
    }
  };

  const goTo = (href, targetGroupId) => {
    markGroupEnter(targetGroupId);
    location.href = href;
  };

  const warmed = new Set();
  const warm = (href) => {
    if (!href || warmed.has(href) || href === location.href) return;
    warmed.add(href);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "document";
    link.href = href;
    document.head.appendChild(link);
  };
  const warmFromEvent = (e) => {
    const link = e.target instanceof Element ? e.target.closest("a[href]") : null;
    if (link) warm(link.href);
  };
  for (const root of [top, bottom]) {
    root.addEventListener("pointerenter", warmFromEvent, true);
    root.addEventListener("pointerdown", warmFromEvent, true);
  }

  const onClick = (e) => {
    const link = e.target instanceof Element ? e.target.closest("a.admin-gnav__tab, a.admin-gnav__sub") : null;
    if (!link) return;
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (link.dataset.page === pageId) {
      e.preventDefault();
      return;
    }
    // Leave the browser to follow the link. Updating the bar first replayed the rise and held navigation for 240ms.
    markGroupEnter(link.dataset.group ?? "");
  };
  top.addEventListener("click", onClick);
  bottom.addEventListener("click", onClick);

  const subsBottom = bottom.querySelector(".admin-gnav__subs");
  let touchStart = null;
  subsBottom?.addEventListener(
    "touchstart",
    (e) => {
      const t = e.touches[0];
      touchStart = t ? { x: t.clientX, y: t.clientY } : null;
    },
    { passive: true },
  );
  subsBottom?.addEventListener("touchend", (e) => {
    const t = e.changedTouches[0];
    if (!touchStart || !t || !currentGroup) return;
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dy) > Math.abs(dx)) return;
    const pages = currentGroup.pages;
    const idx = pages.findIndex((p) => p.id === pageId);
    const next = pages[idx + (dx < 0 ? 1 : -1)];
    if (next) goTo(next.href, currentGroup.id, next.id);
  });

  const ro = new ResizeObserver(() => roots.forEach(refreshThumbs));
  roots.forEach((root) => ro.observe(root));
  document.fonts?.ready.then(() => roots.forEach(refreshThumbs));

  let enterPending = false;
  try {
    enterPending = sessionStorage.getItem(ENTER_KEY) === groupId;
    sessionStorage.removeItem(ENTER_KEY);
  } catch {
    /* private mode */
  }

  return {
    setVisible(visible) {
      topHost?.classList.toggle("admin-hide", !visible);
      bottom.classList.toggle("admin-hide", !visible);
      document.body.classList.toggle("admin-gnav-on", visible);
      if (!visible) return;
      requestAnimationFrame(() => {
        roots.forEach(refreshThumbs);
        if (!enterPending) return;
        enterPending = false;
        roots.forEach((root) => {
          const subs = root.querySelector(".admin-gnav__subs");
          if (subs && !subs.hidden) playEntrance(subs);
        });
      });
    },
  };
}

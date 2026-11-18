import { mountAdminNav } from "./admin-nav.js";

const pageId = document.body?.dataset.adminPage ?? "";
if (pageId && pageId !== "login") {
  const nav = mountAdminNav({
    pageId,
    topHost: document.getElementById("adminNavGroups"),
  });
  document.getElementById("adminNavDrawer")?.classList.remove("admin-hide");
  document.getElementById("adminNavDrawerFooter")?.classList.remove("admin-hide");
  nav.setVisible(true);
  window.__bbmAdminNav = nav;
}

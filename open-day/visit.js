const KEY = "od-visitor";

function localId() {
  try {
    const saved = localStorage.getItem(KEY) || "";
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(saved)) return saved;
    const id = crypto.randomUUID();
    localStorage.setItem(KEY, id);
    return id;
  } catch {
    return "";
  }
}

async function deviceHints() {
  const data = navigator.userAgentData;
  if (!data?.getHighEntropyValues) return {};
  try {
    return await data.getHighEntropyValues(["model", "platform", "platformVersion"]);
  } catch {
    return {};
  }
}

async function reportVisit() {
  const hints = await deviceHints();
  const body = {
    localId: localId(),
    tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
    screen: screen.width + "x" + screen.height,
    dpr: String(window.devicePixelRatio || ""),
    cores: String(navigator.hardwareConcurrency || ""),
    memory: String(navigator.deviceMemory || ""),
    touch: String(navigator.maxTouchPoints || ""),
    platform: navigator.platform || "",
    platformVersion: hints.platformVersion || "",
    chModel: hints.model || "",
    color: String(screen.colorDepth || ""),
    lang: navigator.language || "",
  };
  await fetch("/api/open-day/visit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    keepalive: true,
    body: JSON.stringify(body),
  });
}

reportVisit().catch(() => {});

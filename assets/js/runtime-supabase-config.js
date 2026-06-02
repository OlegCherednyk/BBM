/**
 * Browser Supabase URL + anon key always come from the Node server,
 * which reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` from `.env`.
 * Serve the site via `node server.js` so `/api/public-config` is available.
 *
 * index.html kicks off `window.__bbmPublicConfig` in <head> so the fetch
 * starts before module scripts load.
 */
const CONFIG_CACHE_KEY = "bbm:public-config:v1";

function parseConfigPayload(data) {
  const url = String(data?.supabaseUrl ?? "").trim();
  const anonKey = String(data?.supabaseAnonKey ?? "").trim();
  if (!url || !anonKey) return { url: "", anonKey: "" };
  return { url, anonKey };
}

function readConfigCache() {
  try {
    const raw = sessionStorage.getItem(CONFIG_CACHE_KEY);
    if (!raw) return null;
    const parsed = parseConfigPayload(JSON.parse(raw));
    return parsed.url && parsed.anonKey ? parsed : null;
  } catch (_ignored) {
    return null;
  }
}

function writeConfigCache(config) {
  if (!config?.url || !config?.anonKey) return;
  try {
    sessionStorage.setItem(
      CONFIG_CACHE_KEY,
      JSON.stringify({ supabaseUrl: config.url, supabaseAnonKey: config.anonKey }),
    );
  } catch (_ignored) {
    /* quota / private mode */
  }
}

async function fetchPublicConfigOnce() {
  const early = globalThis.__bbmPublicConfig;
  if (early && typeof early.then === "function") {
    const data = await early;
    if (data) return parseConfigPayload(data);
  }

  const response = await fetch("/api/public-config", {
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new Error(`GET /api/public-config failed: ${response.status}`);
  }
  return parseConfigPayload(await response.json());
}

export async function getSupabaseConfig() {
  const cached = readConfigCache();
  if (cached) return cached;

  const delays = [0, 250, 700];
  let lastError = null;

  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      const config = await fetchPublicConfigOnce();
      if (config.url && config.anonKey) {
        writeConfigCache(config);
        return config;
      }
      console.warn(
        "[supabase] /api/public-config returned empty supabaseUrl or supabaseAnonKey — set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in server .env",
      );
      return { url: "", anonKey: "" };
    } catch (e) {
      lastError = e;
    }
  }

  console.warn("[supabase] /api/public-config unreachable:", lastError?.message || lastError);
  return { url: "", anonKey: "" };
}

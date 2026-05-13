/**
 * Browser Supabase URL + anon key always come from the Node server,
 * which reads `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` from `.env`.
 * Serve the site via `node server.js` so `/api/public-config` is available.
 */
export async function getSupabaseConfig() {
  try {
    const response = await fetch("/api/public-config", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      console.warn(
        "[supabase] GET /api/public-config failed:",
        response.status,
        response.statusText,
      );
      return { url: "", anonKey: "" };
    }
    const data = await response.json();
    const url = String(data?.supabaseUrl ?? "").trim();
    const anonKey = String(data?.supabaseAnonKey ?? "").trim();
    if (!url || !anonKey) {
      console.warn(
        "[supabase] /api/public-config returned empty supabaseUrl or supabaseAnonKey — set PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY in server .env",
      );
      return { url: "", anonKey: "" };
    }
    return { url, anonKey };
  } catch (e) {
    console.warn("[supabase] /api/public-config unreachable:", e?.message || e);
    return { url: "", anonKey: "" };
  }
}

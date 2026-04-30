import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase-config.js";

export async function getSupabaseConfig() {
  try {
    const response = await fetch("/api/public-config", {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
    }
    const data = await response.json();
    return {
      url: data.supabaseUrl || SUPABASE_URL,
      anonKey: data.supabaseAnonKey || SUPABASE_ANON_KEY,
    };
  } catch {
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  }
}

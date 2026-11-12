import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "./supabase-config";

export const ADMIN_COOKIE = "red_admin_session";
export async function verifyAdminToken(token: string | undefined) {
  if (!token || token.length > 8192) return false;
  try {
    const { url, key } = getSupabasePublicConfig();
    const client = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` }, fetch: (input, init) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) }) },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return false;
    const profile = await client.from("profiles").select("role,banned").eq("id", user.id).maybeSingle();
    return !profile.error && profile.data?.role === "admin" && profile.data?.banned === false;
  } catch { return false; }
}
export async function hasAdminSession() {
  return verifyAdminToken((await cookies()).get(ADMIN_COOKIE)?.value);
}

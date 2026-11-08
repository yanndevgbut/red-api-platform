export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Configure NEXT_PUBLIC_SUPABASE_URL and a publishable Supabase key.");

  // The variable is bundled into client code. Refuse privileged legacy JWTs.
  if (!key.startsWith("sb_publishable_")) {
    let role: string | undefined;
    try {
      role = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role;
    } catch {
      throw new Error("Invalid Supabase publishable key.");
    }
    if (role !== "anon") throw new Error("Use a Supabase publishable or legacy anon key in the browser.");
  }
  return { url, key };
}

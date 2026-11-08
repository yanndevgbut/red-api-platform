import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase-config";

function respond(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return respond({ error: "Login diperlukan." }, 401);

  try {
    const { url, key } = getSupabasePublicConfig();
    const supabase = createClient(url, key, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) return respond({ error: "Sesi tidak valid." }, 401);

    const requestedId = req.nextUrl.searchParams.get("userId");
    if (requestedId && requestedId !== user.id) return respond({ error: "Akses ditolak." }, 403);

    const [profile, apiKey] = await Promise.all([
      supabase.from("profiles")
        .select("id,username,email,role,plan,limit_daily,limit_remaining,banned,created_at")
        .eq("id", user.id).maybeSingle(),
      supabase.from("api_keys")
        .select("id,user_id,key,is_active,created_at")
        .eq("user_id", user.id).eq("is_active", true)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    ]);
    if (profile.error || apiKey.error) return respond({ error: "Gagal memuat akun." }, 502);
    return respond({ profile: profile.data, apiKey: apiKey.data });
  } catch {
    return respond({ error: "Layanan akun belum tersedia." }, 503);
  }
}

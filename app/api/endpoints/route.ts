import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/lib/supabase-config";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { url, key } = getSupabasePublicConfig();
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.from("endpoints")
      .select("id,name,category,method,path,description,min_plan,status,params")
      .neq("status", "deprecated").order("id");
    if (!error) return NextResponse.json(data);
  } catch {
    // Configuration and provider errors share the same public response.
  }
  return NextResponse.json({ error: "Katalog endpoint belum tersedia." }, { status: 503 });
}

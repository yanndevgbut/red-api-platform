import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./supabase-config";

let client: SupabaseClient | undefined;

export function getSupabase() {
  if (!client) {
    const { url, key } = getSupabasePublicConfig();
    client = createClient(url, key);
  }
  return client;
}

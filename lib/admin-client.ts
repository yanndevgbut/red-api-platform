import { getSupabase } from "./supabase";
export async function adminRequest(path: string, init: RequestInit = {}) {
  const { data, error } = await getSupabase().auth.getSession();
  if (error || !data.session) throw new Error("Login administrator diperlukan.");
  const response = await fetch(`/api/admin/${path}`, {
    ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}`, ...init.headers },
    cache: "no-store", signal: init.signal ?? AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Permintaan admin ditolak.");
  return result;
}

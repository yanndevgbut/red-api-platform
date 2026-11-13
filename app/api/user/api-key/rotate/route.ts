import { NextRequest, NextResponse } from "next/server";
import { hasForeignOrigin } from "@/lib/request-origin.server";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function POST(req: NextRequest) {
  if (hasForeignOrigin(req)) return respond({ error: "Origin tidak diizinkan." }, 403);
  const authorization = req.headers.get("authorization");
  if (!authorization?.match(/^Bearer \S+$/i) || authorization.length > 8200) return respond({ error: "Login diperlukan." }, 401);
  try {
    const reader = req.body?.getReader(); let size = 0; const chunks: Uint8Array[] = [];
    if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 2048) { await reader.cancel(); return respond({ error: "Request terlalu besar." }, 413); } chunks.push(value); }
    if (size) {
      try { const body = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length) return respond({ error: "Rotasi hanya untuk akun yang sedang login." }, 400); }
      catch { return respond({ error: "JSON tidak valid." }, 400); }
    }
    const origin = new URL(process.env.API_BACKEND_URL || "http://127.0.0.1:3016");
    if (origin.username || origin.password || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) return respond({ error: "Origin backend tidak valid." }, 503);
    const response = await fetch(new URL("/api/user/api-key/rotate", origin), { method: "POST", headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json" }, body: "{}", redirect: "error", cache: "no-store", signal: AbortSignal.timeout(18000) });
    if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) throw new Error();
    const data = await response.json();
    if (!response.ok) return respond({ error: data.error || "Rotasi API key gagal." }, response.status);
    if (!data.apiKey?.id || !data.apiKey?.user_id || typeof data.apiKey?.key !== "string" || data.apiKey.is_active !== true) throw new Error();
    return respond({ apiKey: data.apiKey });
  } catch { return respond({ error: "Hasil rotasi belum dapat dikonfirmasi. Muat ulang akun sebelum mencoba lagi." }, 503); }
}

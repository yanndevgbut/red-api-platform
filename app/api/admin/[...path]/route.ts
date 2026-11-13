import { hasForeignOrigin } from "@/lib/request-origin.server";
import { NextRequest, NextResponse } from "next/server";
type Context = { params: Promise<{ path: string[] }> };
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
async function proxy(req: NextRequest, context: Context) {
  if (hasForeignOrigin(req)) return respond({ error: "Origin tidak diizinkan." }, 403);
  const path = (await context.params).path.join("/");
  const allowed = (req.method === "GET" && /^(endpoints|users|logs|system)$/.test(path)) || (req.method === "POST" && /^(endpoints|maintenance)$/.test(path)) || (req.method === "DELETE" && /^(endpoints\/[1-9]\d{0,9}|users\/[a-f0-9-]{36})$/i.test(path)) || (req.method === "PATCH" && /^users\/[a-f0-9-]{36}$/i.test(path));
  if (!allowed) return respond({ error: "Route tidak ditemukan." }, 404);
  const authorization = req.headers.get("authorization");
  if (!authorization?.match(/^Bearer \S+$/i) || authorization.length > 8200) return respond({ error: "Login diperlukan." }, 401);
  try {
    const origin = new URL(process.env.API_BACKEND_URL || "http://127.0.0.1:3016");
    if (origin.username || origin.password || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) return respond({ error: "Origin backend tidak valid." }, 503);
    let body: string | undefined;
    if (["POST", "PATCH"].includes(req.method)) {
      if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return respond({ error: "Gunakan application/json." }, 415);
      const reader = req.body?.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      if (reader) while (true) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; if (size > 16384) { await reader.cancel(); return respond({ error: "Request terlalu besar." }, 413); } chunks.push(value); }
      try { body = JSON.stringify(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { return respond({ error: "JSON tidak valid." }, 400); }
    }
    const response = await fetch(new URL(`/api/admin/${path}`, origin), { method: req.method, body, headers: { Authorization: authorization, "Content-Type": "application/json", Accept: "application/json", "X-Confirm-Action": req.headers.get("x-confirm-action") || "", "X-Confirm-Target": req.headers.get("x-confirm-target") || "" }, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(12000) });
    if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) throw new Error();
    return respond(await response.json(), response.status);
  } catch { return respond({ error: "Layanan admin belum tersedia." }, 503); }
}
export { proxy as GET, proxy as POST, proxy as PATCH, proxy as DELETE };

import { hasForeignOrigin } from "@/lib/request-origin.server";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const respond = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

async function request(req: NextRequest, method: "GET" | "POST") {
  if (method === "POST" && hasForeignOrigin(req)) return respond({ error: "Origin tidak diizinkan." }, 403);
  try {
    const origin = new URL(process.env.API_BACKEND_URL || "http://127.0.0.1:3016");
    if (origin.username || origin.password || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) return respond({ error: "Backend memerlukan origin HTTPS." }, 503);
    const headers = new Headers({ Accept: "application/json" });
    let body: string | undefined;
    if (method === "POST") {
      const authorization = req.headers.get("authorization");
      if (!authorization?.match(/^Bearer \S+$/i)) return respond({ error: "Login diperlukan." }, 401);
      if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) return respond({ error: "Gunakan application/json." }, 415);
      const reader = req.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 2048) { await reader.cancel(); return respond({ error: "Request terlalu besar." }, 413); }
          chunks.push(value);
        }
      }
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 60) return respond({ error: "Isi nama kategori maksimal 60 karakter." }, 400);
        body = JSON.stringify({ name: value.name });
      } catch { return respond({ error: "Format request tidak valid." }, 400); }
      headers.set("Authorization", authorization);
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(new URL(method === "GET" ? "/api/system/categories" : "/api/admin/categories", origin), {
      method, headers, body, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
    });
    if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) return respond({ error: "Layanan kategori belum tersedia." }, 502);
    const result = await response.json();
    if (!response.ok) return respond({ error: typeof result.error === "string" ? result.error : "Layanan kategori belum tersedia." }, response.status);
    if (!Array.isArray(result.categories) || !result.categories.every((name: unknown) => typeof name === "string")) throw new Error("Invalid categories");
    return respond({ categories: result.categories }, response.status);
  } catch { return respond({ error: "Layanan kategori belum dapat dijangkau." }, 503); }
}
export function GET(req: NextRequest) { return request(req, "GET"); }
export function POST(req: NextRequest) { return request(req, "POST"); }

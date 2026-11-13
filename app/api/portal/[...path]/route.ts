import { NextRequest, NextResponse } from "next/server";
import { hasForeignOrigin } from "@/lib/request-origin.server";
const respond = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
async function proxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const path = (await params).path.join("/");
  const id = "[a-f0-9-]{36}";
  const allowed =
    (req.method === "GET" &&
      ([
        "state",
        "orders",
        "admin/announcements",
        "admin/orders",
        "admin/payment-settings",
        "admin/qris",
      ].includes(path) ||
        new RegExp(`^orders/${id}/(qris|proof)$`, "i").test(path))) ||
    (req.method === "POST" &&
      (["orders", "admin/announcements", "admin/qris"].includes(path) ||
        new RegExp(
          `^orders/${id}/proof$|^admin/orders/${id}/(approve|reject)$`,
          "i",
        ).test(path))) ||
    (req.method === "DELETE" &&
      new RegExp(`^admin/announcements/${id}$`, "i").test(path));
  if (!allowed) return respond({ error: "Route tidak ditemukan." }, 404);
  if (hasForeignOrigin(req))
    return respond({ error: "Origin tidak diizinkan." }, 403);
  const authorization = req.headers.get("authorization");
  if (
    path !== "state" &&
    (!authorization?.match(/^Bearer \S+$/i) || authorization.length > 8200)
  )
    return respond({ error: "Login diperlukan." }, 401);
  try {
    const origin = new URL(
      process.env.API_BACKEND_URL || "http://127.0.0.1:3016",
    );
    if (
      origin.username ||
      origin.password ||
      (origin.protocol !== "https:" &&
        !(
          origin.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
        ))
    )
      return respond({ error: "Origin backend tidak valid." }, 503);
    const headers = new Headers({ Accept: "application/json" });
    if (authorization) headers.set("Authorization", authorization);
    const confirm = req.headers.get("x-confirm-action");
    if (confirm) headers.set("X-Confirm-Action", confirm);
    let body: string | undefined;
    if (req.method === "POST") {
      if (!/^application\/json\b/i.test(req.headers.get("content-type") || ""))
        return respond({ error: "Gunakan application/json." }, 415);
      const limit =
        path === "admin/qris" || path.endsWith("/proof") ? 4300000 : 16384;
      const reader = req.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      if (reader)
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > limit) {
            await reader.cancel();
            return respond({ error: "Request terlalu besar." }, 413);
          }
          chunks.push(value);
        }
      try {
        body = JSON.stringify(
          JSON.parse(Buffer.concat(chunks).toString("utf8")),
        );
      } catch {
        return respond({ error: "JSON tidak valid." }, 400);
      }
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(new URL(`/api/portal/${path}`, origin), {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(20000),
    });
    const type = response.headers.get("content-type") || "";
    if (/^image\/(png|jpeg)\b/i.test(type) && req.method === "GET")
      return new NextResponse(await response.arrayBuffer(), {
        status: response.status,
        headers: {
          "Content-Type": type,
          "Cache-Control": "private, no-store",
          "X-Content-Type-Options": "nosniff",
        },
      });
    if (!/^application\/json\b/i.test(type)) throw new Error();
    return respond(await response.json(), response.status);
  } catch {
    return respond({ error: "Layanan portal belum dapat dijangkau." }, 503);
  }
}
export { proxy as GET, proxy as POST, proxy as DELETE };

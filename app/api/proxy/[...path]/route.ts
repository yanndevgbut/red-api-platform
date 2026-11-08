import { NextRequest, NextResponse } from "next/server";
import { isFeaturePath } from "@/lib/api";

type Context = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, { params }: Context) {
  const path = `/${(await params).path.join("/")}`;
  if (path !== "/health" && path !== "/api/system/stats" && !isFeaturePath(path)) {
    return NextResponse.json({ error: "Endpoint tidak ditemukan." }, { status: 404 });
  }

  try {
    const upstream = new URL(path, process.env.API_BACKEND_URL || "http://127.0.0.1:3016");
    if (upstream.protocol !== "https:" &&
        !(upstream.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(upstream.hostname))) {
      return NextResponse.json({ error: "Node API memerlukan origin HTTPS." }, { status: 503 });
    }
    upstream.search = req.nextUrl.search;
    const headers = new Headers({ Accept: "application/json" });
    const apiKey = req.headers.get("x-api-key") || upstream.searchParams.get("apikey");
    upstream.searchParams.delete("apikey");
    if (apiKey) headers.set("x-api-key", apiKey);

    let body: string | undefined;
    if (req.method === "POST") {
      if (!/^application\/json\b/i.test(req.headers.get("content-type") || "")) {
        return NextResponse.json({ error: "Gunakan application/json." }, { status: 415 });
      }
      const reader = req.body?.getReader();
      const decoder = new TextDecoder();
      let size = 0;
      body = "";
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16 * 1024) {
            await reader.cancel();
            return NextResponse.json({ error: "Request terlalu besar." }, { status: 413 });
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      }
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(upstream, {
      method: req.method, headers, body, redirect: "manual",
      cache: "no-store", signal: AbortSignal.timeout(22000),
    });
    if (!/^application\/json\b/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel();
      return NextResponse.json({ error: "Respons node tidak valid." }, { status: 502 });
    }
    return new NextResponse(response.body, {
      status: response.status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Node API tidak dapat dijangkau." }, { status: 502 });
  }
}

export { proxy as GET, proxy as POST };

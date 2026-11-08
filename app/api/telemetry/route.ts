import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function respond(body: unknown, status = 200) {
  return { body, status, expires: Date.now() + 5000 };
}
let cached: ReturnType<typeof respond> | undefined;
let pending: Promise<ReturnType<typeof respond>> | undefined;

async function readTelemetry() {
  try {
    // Optional HTTPS panel API avoids depending on the game allocation's TLS.
    // The client token stays on the server; never forward it to the browser.
    const panelKey = process.env.PTERODACTYL_CLIENT_API_KEY;
    const panelUrl = process.env.PTERODACTYL_URL;
    const serverId = process.env.PTERODACTYL_SERVER_ID;
    if (panelKey && panelUrl && serverId) {
      const origin = new URL(panelUrl);
      if (origin.protocol !== "https:" || origin.username || origin.password || !/^[a-z0-9-]+$/i.test(serverId)) throw new Error("Invalid panel configuration");
      const res = await fetch(new URL(`/api/client/servers/${serverId}/resources`, origin), {
        headers: { Authorization: `Bearer ${panelKey}`, Accept: "application/json" },
        cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error("Panel unavailable");
      const { attributes } = await res.json();
      const resources = attributes?.resources;
      if (attributes?.current_state !== "running" || !resources || !Number.isFinite(resources.memory_bytes) || !Number.isFinite(resources.cpu_absolute) || !Number.isFinite(resources.uptime)) throw new Error("Server offline");
      const seconds = Math.floor(resources.uptime / 1000);
      return respond({ status: true, data: {
        node: "Pterodactyl", platform: "Panel resources", node_version: "",
        cpu: { model: "CPU usage (100% = 1 core)", cores: 1, usage_percent: Math.round(resources.cpu_absolute * 100) / 100 },
        memory: { used_gb: (resources.memory_bytes / 1024 ** 3).toFixed(2), total_gb: "—", usage_percent: 0 },
        uptime: { raw_seconds: seconds, formatted: `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m` },
        timestamp: new Date().toISOString(),
      } });
    }

    const origin = new URL(process.env.API_BACKEND_URL || "http://127.0.0.1:3016");
    if (origin.username || origin.password || (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)))) throw new Error("Invalid backend configuration");
    const res = await fetch(new URL("/api/system/stats", origin), {
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error("Backend unavailable");
    const body = await res.json();
    const data = body?.data;
    if (!body.status || !data?.cpu || !data?.memory || !data?.uptime) throw new Error("Invalid stats");
    // Explicitly project public fields, even if the upstream response changes.
    return respond({ status: true, data: {
      node: data.node, platform: data.platform, node_version: data.node_version,
      cpu: { model: data.cpu.model, cores: data.cpu.cores, usage_percent: data.cpu.usage_percent },
      memory: { used_gb: data.memory.used_gb, total_gb: data.memory.total_gb, usage_percent: data.memory.usage_percent },
      uptime: { raw_seconds: data.uptime.raw_seconds, formatted: data.uptime.formatted }, timestamp: data.timestamp,
    } });
  } catch {
    return respond({ status: false, error: "Statistik server belum tersedia. Silakan coba lagi." }, 503);
  }
}

// Share provider requests across visitors to avoid exhausting the panel API.
export async function GET() {
  if (!cached || cached.expires <= Date.now()) {
    pending ??= readTelemetry();
    try {
      cached = await pending;
    } finally {
      pending = undefined;
    }
  }
  return NextResponse.json(cached.body, { status: cached.status, headers: { "Cache-Control": "no-store" } });
}

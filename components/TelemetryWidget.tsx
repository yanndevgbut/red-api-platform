"use client";

import React, { useCallback } from "react";
import { TelemetryData } from "@/types";
import { usePollingResource } from "@/lib/use-polling-resource";

export default function TelemetryWidget() {
  const fetchStats = useCallback(async (signal: AbortSignal): Promise<TelemetryData> => {
    const res = await fetch("/api/telemetry", { signal, cache: "no-store" });
    if (!res.ok) throw new Error("Telemetry unavailable");
    const json = await res.json();
    if (!json.status || !json.data?.cpu || !json.data?.memory || !json.data?.uptime || !Number.isFinite(json.data.cpu.usage_percent) || !Number.isFinite(json.data.memory.usage_percent)) throw new Error("Invalid telemetry");
    return json.data;
  }, []);
  const { data: telemetry, error, loading, refreshing, reload } = usePollingResource(fetchStats, 5000, 8000);
  const placeholder = loading ? "Memuat..." : "Tidak tersedia";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <span className="w-2.5 h-2.5 shrink-0 bg-red-600 rounded-full" />
          <h2 className="font-bebas text-3xl tracking-wide text-white">LIVE SERVER TELEMETRY (PTERODACTYL)</h2>
        </div>
        <span className="text-xs font-mono-code text-zinc-500">REALTIME MONITOR</span>
      </div>

      <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono-code text-zinc-400">
        <span>{error ? `${error}${telemetry ? " Menampilkan data terakhir; data mungkin kedaluwarsa." : " Statistik server belum tersedia."}` : telemetry ? "Statistik server berhasil diperbarui." : "Menghubungkan ke server..."}</span>
        <button type="button" onClick={reload} disabled={refreshing} className="rounded border border-surface-border px-3 py-2 disabled:opacity-50">{refreshing ? "Memperbarui..." : "Coba lagi / Refresh"}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: CPU */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>CPU LOAD</span>
            <span className="text-red-400 font-bold">
              {telemetry ? `${telemetry.cpu.usage_percent}%` : placeholder}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-2 rounded overflow-hidden">
            <div
              className="bg-red-600 h-full transition-all duration-500"
              style={{ width: `${telemetry ? Math.max(0, Math.min(100, telemetry.cpu.usage_percent)) : 0}%` }}
            />
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 truncate block">
            {telemetry ? `${telemetry.cpu.model} (${telemetry.cpu.cores} Cores)` : "—"}
          </span>
        </div>

        {/* Metric 2: RAM */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>MEMORY USAGE</span>
            <span className="text-zinc-200 font-bold">
              {telemetry ? `${telemetry.memory.used_gb} / ${telemetry.memory.total_gb} GB` : placeholder}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-2 rounded overflow-hidden">
            <div
              className="bg-red-700 h-full transition-all duration-500"
              style={{ width: `${telemetry ? Math.max(0, Math.min(100, telemetry.memory.usage_percent)) : 0}%` }}
            />
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 block">
            {telemetry ? (telemetry.memory.total_gb === "—" ? "Batas RAM tidak disediakan panel" : `Utilization: ${telemetry.memory.usage_percent}% Allocated`) : "—"}
          </span>
        </div>

        {/* Metric 3: Node Engine */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>NODE INSTANCE</span>
            <span className="text-zinc-300 font-bold">{telemetry && !error ? "TERHUBUNG" : "BELUM TERVERIFIKASI"}</span>
          </div>
          <div className="font-bebas text-4xl text-white tracking-wide truncate">
            {telemetry ? telemetry.node : "—"}
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 block">
            {telemetry ? `${telemetry.platform} · ${telemetry.node_version}` : "—"}
          </span>
        </div>

        {/* Metric 4: Uptime */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>SYSTEM UPTIME</span>
            <span className="text-zinc-300 font-bold">{telemetry && !error ? "ONLINE" : "—"}</span>
          </div>
          <div className="font-bebas text-4xl text-white tracking-wide">
            {telemetry ? telemetry.uptime.formatted : placeholder}
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 block">
            Waktu aktif server
          </span>
        </div>
      </div>
    </div>
  );
}

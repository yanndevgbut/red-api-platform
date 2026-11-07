"use client";

import React, { useEffect, useState } from "react";
import { TelemetryData } from "@/types";

export default function TelemetryWidget() {
  const [telemetry, setTelemetry] = useState<TelemetryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "http://103.155.224.102:3016";
        const res = await fetch(`${baseUrl}/api/system/stats`, { signal: AbortSignal.timeout(4000) });
        if (res.ok) {
          const json = await res.json();
          if (json.status && json.data) {
            setTelemetry(json.data);
          }
        }
      } catch (err) {
        console.error("Telemetry fetch error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-ping" />
          <h2 className="font-bebas text-3xl tracking-wide text-white">LIVE SERVER TELEMETRY (PTERODACTYL)</h2>
        </div>
        <span className="text-xs font-mono-code text-zinc-500">REALTIME MONITOR</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: CPU */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>CPU LOAD</span>
            <span className="text-red-400 font-bold">
              {telemetry ? `${telemetry.cpu.usage_percent}%` : "Loading..."}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-2 rounded overflow-hidden">
            <div
              className="bg-red-600 h-full transition-all duration-500"
              style={{ width: `${telemetry ? telemetry.cpu.usage_percent : 20}%` }}
            />
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 truncate block">
            {telemetry ? `${telemetry.cpu.model} (${telemetry.cpu.cores} Cores)` : "AMD/Intel Dedicated CPU"}
          </span>
        </div>

        {/* Metric 2: RAM */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>MEMORY USAGE</span>
            <span className="text-zinc-200 font-bold">
              {telemetry ? `${telemetry.memory.used_gb} / ${telemetry.memory.total_gb} GB` : "Loading..."}
            </span>
          </div>
          <div className="w-full bg-zinc-900 h-2 rounded overflow-hidden">
            <div
              className="bg-red-700 h-full transition-all duration-500"
              style={{ width: `${telemetry ? telemetry.memory.usage_percent : 15}%` }}
            />
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 block">
            {telemetry ? `Utilization: ${telemetry.memory.usage_percent}% Allocated` : "DDR4 ECC High Frequency"}
          </span>
        </div>

        {/* Metric 3: Node Engine */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>NODE INSTANCE</span>
            <span className="text-emerald-400 font-bold">ACTIVE</span>
          </div>
          <div className="font-bebas text-4xl text-white tracking-wide truncate">
            {telemetry ? telemetry.node : "PTERO-SG-01"}
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 block">
            {telemetry ? `${telemetry.platform} · ${telemetry.node_version}` : "Linux x64"}
          </span>
        </div>

        {/* Metric 4: Uptime */}
        <div className="bg-surface-panel border border-surface-border p-4 rounded-lg space-y-2 hover:border-red-900/60 transition-colors">
          <div className="flex justify-between items-center text-xs font-mono-code text-zinc-400">
            <span>SYSTEM UPTIME</span>
            <span className="text-zinc-300 font-bold">99.98%</span>
          </div>
          <div className="font-bebas text-4xl text-white tracking-wide">
            {telemetry ? telemetry.uptime.formatted : "Loading..."}
          </div>
          <span className="text-[10px] font-mono-code text-zinc-500 block">
            High Availability Cluster
          </span>
        </div>
      </div>
    </div>
  );
}

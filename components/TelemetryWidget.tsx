"use client";

import React, { useCallback } from "react";
import { TelemetryData } from "@/types";
import { usePollingResource } from "@/lib/use-polling-resource";

export default function TelemetryWidget() {
  const fetchStats = useCallback(
    async (signal: AbortSignal): Promise<TelemetryData> => {
      const res = await fetch("/api/telemetry", { signal, cache: "no-store" });
      if (!res.ok) throw new Error("Telemetry unavailable");
      const json = await res.json();
      if (
        !json.status ||
        !json.data?.cpu ||
        !json.data?.memory ||
        !json.data?.uptime ||
        !Number.isFinite(json.data.cpu.usage_percent) ||
        !Number.isFinite(json.data.memory.usage_percent)
      )
        throw new Error("Invalid telemetry");
      return json.data;
    },
    [],
  );
  const {
    data: telemetry,
    error,
    loading,
    refreshing,
    reload,
  } = usePollingResource(fetchStats, 5000, 8000);
  const status = loading
    ? "Memeriksa status…"
    : error
      ? "Status belum terverifikasi"
      : "Server merespons";
  return (
    <section
      aria-labelledby="server-status-heading"
      className="min-w-0 rounded-xl border border-surface-border bg-surface-panel p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          id="server-status-heading"
          className="text-base font-semibold text-white"
        >
          Status layanan
        </h2>
        <span
          className={`inline-flex items-center gap-2 text-sm ${error || loading ? "text-zinc-300" : "text-emerald-300"}`}
        >
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${error || loading ? "bg-zinc-500" : "bg-emerald-400"}`}
          />
          {status}
        </span>
      </div>
      {error && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-zinc-400">
          <p>
            {telemetry
              ? "Detail di bawah ini berasal dari pembaruan terakhir."
              : "Statistik server belum dapat dimuat."}
          </p>
          <button
            type="button"
            onClick={reload}
            disabled={refreshing}
            className="min-h-9 rounded-lg border border-surface-border px-3 text-sm text-zinc-200 disabled:opacity-60"
          >
            Periksa lagi
          </button>
        </div>
      )}
      {telemetry && (
        <details className="mt-3 border-t border-surface-border pt-3">
          <summary className="cursor-pointer text-sm text-zinc-300">
            Detail server
          </summary>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <Metric label="CPU" value={`${telemetry.cpu.usage_percent}%`} />
            <Metric
              label="Memori"
              value={`${telemetry.memory.used_gb} / ${telemetry.memory.total_gb} GB`}
            />
            <Metric
              label="Runtime"
              value={`${telemetry.platform} · Node.js ${telemetry.node_version}`}
            />
            <Metric label="Waktu aktif" value={telemetry.uptime.formatted} />
          </dl>
        </details>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-surface-border p-3">
      <dt className="text-xs text-zinc-400">{label}</dt>
      <dd className="mt-1 break-words font-medium text-white">{value}</dd>
    </div>
  );
}

"use client";
import { Power } from "lucide-react";
export default function SystemSettings({ maintenance, disabled, toggleMaintenance }: { maintenance: boolean; disabled: boolean; toggleMaintenance: () => void }) {
  return <div className="max-w-2xl space-y-4">
    <p className="text-sm leading-relaxed text-zinc-400">Aktifkan maintenance untuk menghentikan sementara akses ke endpoint API. Health dan statistik server tetap tersedia.</p>
        <div className="flex flex-wrap items-center justify-between gap-4 bg-surface-panel border border-surface-border p-5 rounded-xl">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono-code text-zinc-300 font-bold">MAINTENANCE MODE</span>
            <span
              className={`text-[10px] font-mono-code ${
                maintenance ? "text-red-400 font-bold" : "text-emerald-400"
              }`}
            >
              STATUS: {maintenance ? "ACTIVE (503)" : "NORMAL"}
            </span>
          </div>
          <button
            onClick={toggleMaintenance}
            disabled={disabled}
            className={`px-3 py-1 rounded text-xs font-mono-code transition-colors flex items-center gap-1 ${
              maintenance
                ? "bg-red-600 hover:bg-red-500 text-black font-bold"
                : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            TOGGLE
          </button>
        </div>
  </div>;
}

"use client";
import { useEffect, useState } from "react";
import { Power } from "lucide-react";
export default function SystemSettings({
  maintenance,
  message,
  disabled,
  toggleMaintenance,
  saveMessage,
}: {
  maintenance: boolean;
  message: string;
  disabled: boolean;
  toggleMaintenance: () => void;
  saveMessage: (message: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(message);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(message);
  }, [message, dirty]);
  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-sm leading-relaxed text-zinc-400">
        Aktifkan maintenance untuk menghentikan sementara akses pengguna dan
        endpoint API. Admin tetap dapat mengelola panel.
      </p>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-surface-border bg-surface-panel p-5">
        <div>
          <span className="block text-xs font-bold text-zinc-300">
            MAINTENANCE MODE
          </span>
          <span
            className={`text-xs ${maintenance ? "text-red-400" : "text-emerald-400"}`}
          >
            STATUS: {maintenance ? "ACTIVE (503)" : "NORMAL"}
          </span>
        </div>
        <button
          onClick={toggleMaintenance}
          disabled={disabled}
          className="flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-xs disabled:opacity-40"
        >
          <Power className="h-4 w-4" />
          TOGGLE
        </button>
      </div>
      <form
        className="space-y-4 rounded-xl border border-red-900 bg-surface-panel p-5"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await saveMessage(draft.trim())) setDirty(false);
        }}
      >
        <label
          htmlFor="maintenance-message"
          className="block text-sm font-semibold"
        >
          Pesan pop up maintenance
        </label>
        <textarea
          id="maintenance-message"
          required
          maxLength={500}
          rows={5}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setDirty(true);
          }}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-950 p-3 text-sm focus:border-red-500 focus:outline-none"
        />
        <p className="text-xs text-zinc-500">
          {draft.length}/500 karakter. Pesan ditampilkan sebagai teks. Menyimpan
          pesan tidak mengubah status maintenance.
        </p>
        <button
          disabled={disabled || !dirty || !draft.trim()}
          className="rounded-lg bg-red-600 px-4 py-3 text-sm disabled:opacity-40"
        >
          Simpan pesan maintenance
        </button>
      </form>
    </div>
  );
}

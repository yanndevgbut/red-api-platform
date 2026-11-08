"use client";

import React, { useState } from "react";
import { Profile, ApiKey } from "@/types";
import { Eye, EyeOff, Copy, RefreshCw, Check } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

interface UserDashboardProps {
  user: Profile | null;
  apiKey: ApiKey | null;
  onRefresh: () => void;
}

export default function UserDashboard({ user, apiKey, onRefresh }: UserDashboardProps) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const [feedback, setFeedback] = useState("");
  const keyString = apiKey?.key ?? "";

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(keyString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFeedback("Gagal menyalin API key.");
    }
  };

  const handleRegenerate = async () => {
    if (!user || !confirm("Buat API key baru? Key lama akan dinonaktifkan.")) return;
    setRegenerating(true);
    setFeedback("");
    try {
      const { error } = await getSupabase().rpc("rotate_my_api_key");
      if (error) throw error;
      setShowKey(false);
      onRefresh();
      setFeedback("API key baru dibuat.");
    } catch {
      setFeedback("Gagal membuat API key baru. Silakan coba lagi.");
    } finally {
      setRegenerating(false);
    }
  };

  const remaining = user ? user.limit_remaining : 14280;
  const total = user ? user.limit_daily : 15000;
  const used = Math.max(0, total - remaining);
  const percentUsed = total > 0 ? Math.min(100, Math.round(used / total * 100)) : 0;

  return (
    <div className="space-y-8">
      <div className="border-b border-surface-border pb-4">
        <h2 className="font-bebas text-4xl tracking-wide text-white">USER DASHBOARD & CREDENTIALS</h2>
        <p className="text-xs font-mono-code text-zinc-400">
          Kelola API Key, pantau kuota request harian, dan informasi paket Anda.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Profile Card */}
        <div className="lg:col-span-5 min-w-0 bg-surface-panel border border-surface-border rounded-xl p-4 sm:p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 shrink-0 bg-red-600 rounded flex items-center justify-center font-bebas text-3xl text-black font-bold">
              {user ? user.username.substring(0, 2).toUpperCase() : "DU"}
            </div>
            <div className="min-w-0">
              <h3 className="font-bebas text-2xl text-white leading-none">
                {user ? user.username.toUpperCase() : "DEMO_USER"}
              </h3>
              <span className="text-xs font-mono-code text-zinc-400">
                {user ? user.email : "user@redapi.dev"}
              </span>
              <div className="mt-1">
                <span className="text-[10px] font-mono-code px-2 py-0.5 rounded bg-red-950 text-red-300 border border-red-800 uppercase font-bold">
                  PLAN: {user ? user.plan.toUpperCase() : "VIP"} MEMBER
                </span>
              </div>
            </div>
          </div>

          {/* Quota Gauge */}
          <div className="space-y-2 border-t border-surface-border pt-4">
            <div className="flex justify-between items-center text-xs font-mono-code">
              <span className="text-zinc-400">DAILY QUOTA USAGE</span>
              <span className="text-white font-bold">
                {used.toLocaleString()} / {total.toLocaleString()} REQS
              </span>
            </div>
            <div className="w-full bg-zinc-900 h-2.5 rounded overflow-hidden">
              <div
                className="bg-red-600 h-full transition-all duration-500"
                style={{ width: `${percentUsed}%` }}
              />
            </div>
            <span className="text-[10px] font-mono-code text-zinc-500">
              Reset otomatis setiap pukul 00:00 WIB
            </span>
          </div>

          {/* Account Details */}
          <div className="space-y-2 border-t border-surface-border pt-4 text-xs font-mono-code text-zinc-400">
            <div className="flex justify-between">
              <span>Account ID:</span>
              <span className="text-zinc-200">{user ? user.id.substring(0, 16) : "usr_demo9482fa810"}</span>
            </div>
            <div className="flex justify-between">
              <span>Status:</span>
              <span className="text-emerald-400">{user?.banned ? "Suspended" : "Active"}</span>
            </div>
            <div className="flex justify-between">
              <span>Role:</span>
              <span className="text-red-400 font-bold uppercase">{user ? user.role : "VIP"}</span>
            </div>
          </div>
        </div>

        {/* API Key Vault */}
        <div className="lg:col-span-7 min-w-0 bg-surface-panel border border-surface-border rounded-xl p-4 sm:p-6 space-y-6">
          <div className="flex flex-wrap gap-2 items-center justify-between border-b border-surface-border pb-3">
            <h3 className="font-bebas text-2xl text-white">YOUR PRODUCTION API KEY</h3>
            <span className="text-xs font-mono-code text-emerald-400">{apiKey ? "ACTIVE" : "KEY BELUM TERSEDIA"}</span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Sertakan API Key ini pada setiap request API melalui header <code className="text-red-400">x-api-key: KEY</code>. Jangan bagikan key Anda ke publik.
          </p>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                readOnly
                value={keyString}
                aria-label="API key"
                placeholder="API key belum tersedia"
                className="w-full min-w-0 sm:flex-1 bg-surface-card border border-surface-border px-3 py-2 text-xs font-mono-code text-red-300 rounded focus:outline-none"
              />

              <button
                onClick={() => setShowKey(!showKey)}
                disabled={!apiKey}
                className="px-3 py-2 bg-surface-card border border-surface-border hover:border-zinc-400 text-xs font-mono-code text-zinc-300 rounded flex items-center gap-1"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showKey ? "HIDE" : "SHOW"}
              </button>

              <button
                onClick={handleCopy}
                disabled={!apiKey}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 text-black font-bebas text-lg tracking-wider rounded uppercase flex items-center gap-1"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
          </div>

          <div className="pt-2 flex flex-wrap gap-2 items-center justify-between">
            <button
              onClick={handleRegenerate}
              disabled={regenerating || user?.banned}
              className="px-4 py-2 border border-red-800 text-red-400 hover:bg-red-950/40 text-xs font-mono-code rounded transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
              REGENERATE API KEY
            </button>
            <span className="text-[10px] font-mono-code text-zinc-500">
              Key lama langsung dinonaktifkan
            </span>
          </div>

          {feedback && <p role="status" className="text-xs text-zinc-300">{feedback}</p>}

          {/* Quick Integration Instructions */}
          <div className="bg-black/60 border border-surface-border rounded p-3 text-xs font-mono-code text-zinc-400 space-y-1">
            <span className="text-red-400 font-bold">EXAMPLE USAGE:</span>
            <div className="text-[11px] text-zinc-300 select-all break-all">
              curl -H &quot;x-api-key: YOUR_KEY&quot; &quot;https://YOUR_SITE/api/proxy/api/ai/chat?prompt=halo&quot;
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useState } from "react";
import { Profile, ApiKey } from "@/types";
import { Eye, EyeOff, Copy, RefreshCw, Check } from "lucide-react";
import { supabase } from "@/lib/supabase";

interface UserDashboardProps {
  user: Profile | null;
  apiKey: ApiKey | null;
  onRefresh: () => void;
}

export default function UserDashboard({ user, apiKey, onRefresh }: UserDashboardProps) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const keyString = apiKey ? apiKey.key : "red_live_demo_unauthenticated_key";

  const handleCopy = () => {
    navigator.clipboard.writeText(keyString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = async () => {
    if (!user) {
      alert("Silakan login terlebih dahulu untuk regenerate API key.");
      return;
    }

    if (!confirm("Regenerate API Key? Key lama tidak akan bisa digunakan lagi.")) return;

    setRegenerating(true);
    try {
      const randStr = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
      const newKey = `red_live_${randStr}`;

      // Deactivate old keys
      await supabase
        .from("api_keys")
        .update({ is_active: false })
        .eq("user_id", user.id);

      // Insert new active key
      await supabase
        .from("api_keys")
        .insert({ user_id: user.id, key: newKey, is_active: true });

      alert("API Key baru berhasil dibuat!");
      onRefresh();
    } catch (err: any) {
      alert(`Gagal regenerate key: ${err.message}`);
    } finally {
      setRegenerating(false);
    }
  };

  const remaining = user ? user.limit_remaining : 14280;
  const total = user ? user.limit_daily : 15000;
  const percentUsed = Math.min(100, Math.round(((total - remaining) / total) * 100));

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
        <div className="lg:col-span-5 bg-surface-panel border border-surface-border rounded-lg p-6 space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-red-600 rounded flex items-center justify-center font-bebas text-3xl text-black font-bold">
              {user ? user.username.substring(0, 2).toUpperCase() : "DU"}
            </div>
            <div>
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
                {(total - remaining).toLocaleString()} / {total.toLocaleString()} REQS
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
              <span className="text-emerald-400">Active</span>
            </div>
            <div className="flex justify-between">
              <span>Role:</span>
              <span className="text-red-400 font-bold uppercase">{user ? user.role : "VIP"}</span>
            </div>
          </div>
        </div>

        {/* API Key Vault */}
        <div className="lg:col-span-7 bg-surface-panel border border-surface-border rounded-lg p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-surface-border pb-3">
            <h3 className="font-bebas text-2xl text-white">YOUR PRODUCTION API KEY</h3>
            <span className="text-xs font-mono-code text-emerald-400">ACTIVE & VERIFIED</span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Sertakan API Key ini pada setiap request API via query param <code className="text-red-400">?apikey=KEY</code> atau Header <code className="text-red-400">x-api-key: KEY</code>. Jangan bagikan key Anda ke publik.
          </p>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                readOnly
                value={keyString}
                className="flex-1 bg-surface-card border border-surface-border px-3 py-2 text-xs font-mono-code text-red-300 rounded focus:outline-none"
              />

              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 py-2 bg-surface-card border border-surface-border hover:border-zinc-400 text-xs font-mono-code text-zinc-300 rounded flex items-center gap-1"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {showKey ? "HIDE" : "SHOW"}
              </button>

              <button
                onClick={handleCopy}
                className="px-3 py-2 bg-red-600 hover:bg-red-500 text-black font-bebas text-lg tracking-wider rounded uppercase flex items-center gap-1"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? "COPIED" : "COPY"}
              </button>
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="px-4 py-2 border border-red-800 text-red-400 hover:bg-red-950/40 text-xs font-mono-code rounded transition-colors flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? "animate-spin" : ""}`} />
              REGENERATE API KEY
            </button>
            <span className="text-[10px] font-mono-code text-zinc-500">
              Key lama langsung dinonaktifkan
            </span>
          </div>

          {/* Quick Integration Instructions */}
          <div className="bg-black/60 border border-surface-border rounded p-3 text-xs font-mono-code text-zinc-400 space-y-1">
            <span className="text-red-400 font-bold">EXAMPLE USAGE:</span>
            <div className="text-[11px] text-zinc-300 select-all break-all">
              http://103.155.224.102:3016/api/ai/chat?prompt=halo&apikey={keyString}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

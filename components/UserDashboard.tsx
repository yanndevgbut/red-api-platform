"use client";

import React, { useState } from "react";
import { Profile, ApiKey } from "@/types";
import { Eye, EyeOff, Copy, RefreshCw, Check } from "lucide-react";

interface UserDashboardProps {
  user: Profile;
  apiKey: ApiKey | null;
  onRefresh: () => void;
  onKeyRotated: (key: ApiKey) => void;
  accessToken: string;
}

export default function UserDashboard({
  user,
  apiKey,
  onRefresh,
  onKeyRotated,
  accessToken,
}: UserDashboardProps) {
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
    if (!confirm("Buat API key baru? Key lama akan dinonaktifkan.")) return;
    setRegenerating(true);
    setFeedback("");
    try {
      if (!accessToken)
        throw new Error("Sesi sudah tidak valid. Silakan login kembali.");
      const response = await fetch("/api/user/api-key/rotate", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: "{}",
        signal: AbortSignal.timeout(22000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Gagal mengganti API key.");
      if (
        data.apiKey?.user_id !== user.id ||
        typeof data.apiKey?.key !== "string" ||
        data.apiKey.is_active !== true
      )
        throw new Error("Respons API key tidak valid.");
      onKeyRotated(data.apiKey);
      setShowKey(false);
      setFeedback("API key baru dibuat. Semua key lama sudah dinonaktifkan.");
    } catch (error) {
      onRefresh();
      setFeedback(
        error instanceof Error
          ? error.message
          : "Gagal mengganti API key. Silakan coba lagi.",
      );
    } finally {
      setRegenerating(false);
    }
  };

  const total = Math.max(0, user.limit_daily);
  const remaining = Math.max(0, user.limit_remaining);
  const used = Math.max(0, total - remaining);
  const format = new Intl.NumberFormat("id-ID");
  const plan = user.plan.charAt(0).toUpperCase() + user.plan.slice(1);
  const control =
    "inline-flex min-h-11 items-center gap-2 rounded-lg border border-surface-border px-3 text-sm text-zinc-200 hover:bg-surface-card disabled:opacity-50";

  return (
    <div className="space-y-5">
      <h1 className="font-bebas text-4xl leading-none text-white sm:text-5xl">
        Profil & API key
      </h1>
      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[1fr_1.35fr]">
        <section
          aria-labelledby="profile-account"
          className="min-w-0 space-y-5 rounded-xl border border-surface-border bg-surface-panel p-5"
        >
          <div className="flex items-start gap-3">
            <div
              aria-hidden="true"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-red-950 text-sm font-semibold text-red-200"
            >
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h2
                id="profile-account"
                className="break-words font-semibold text-white"
              >
                {user.username}
              </h2>
              <p className="break-all text-sm text-zinc-400">{user.email}</p>
              <p className="mt-1 text-xs text-zinc-300">
                Paket {plan}
                {user.banned ? " · Akun diblokir" : ""}
              </p>
            </div>
          </div>
          <div className="space-y-2 border-t border-surface-border pt-4">
            <h3 className="text-sm font-semibold text-white">Kuota harian</h3>
            <p className="font-mono-code text-2xl font-semibold tabular-nums text-white">
              {format.format(remaining)}{" "}
              <span className="text-sm font-normal text-zinc-400">
                request tersisa
              </span>
            </p>
            {total > 0 && (
              <progress
                aria-label="Kuota harian terpakai"
                value={Math.min(total, used)}
                max={total}
                className="quota-progress block h-2 w-full overflow-hidden rounded-full"
              />
            )}
            <p className="text-xs text-zinc-400">
              {format.format(used)} terpakai dari {format.format(total)} request
            </p>
          </div>
        </section>

        <section
          aria-labelledby="profile-key"
          className="min-w-0 space-y-4 rounded-xl border border-surface-border bg-surface-panel p-5"
        >
          <div>
            <h2 id="profile-key" className="text-lg font-semibold text-white">
              API key Anda
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-zinc-400">
              Sertakan pada header{" "}
              <code className="font-mono-code text-red-300">x-api-key</code> di
              setiap request. Simpan key secara pribadi.
            </p>
          </div>
          {apiKey ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type={showKey ? "text" : "password"}
                aria-label="API key"
                value={keyString}
                readOnly
                className="min-h-11 w-full min-w-0 rounded-lg border border-surface-border bg-surface px-3 text-sm font-mono-code text-zinc-200 sm:flex-1"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className={control}
              >
                {showKey ? (
                  <EyeOff className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden="true" />
                )}
                {showKey ? "Sembunyikan" : "Tampilkan"}
              </button>
              <button type="button" onClick={handleCopy} className={control}>
                {copied ? (
                  <Check
                    className="h-4 w-4 text-emerald-400"
                    aria-hidden="true"
                  />
                ) : (
                  <Copy className="h-4 w-4" aria-hidden="true" />
                )}
                {copied ? "Tersalin" : "Salin key"}
              </button>
            </div>
          ) : (
            <p className="text-sm text-zinc-300">Belum ada API key aktif.</p>
          )}
          <div className="space-y-2 border-t border-surface-border pt-4">
            <button
              type="button"
              disabled={regenerating || user.banned}
              onClick={handleRegenerate}
              className={control}
            >
              <RefreshCw
                className={`h-4 w-4 ${regenerating ? "motion-safe:animate-spin" : ""}`}
                aria-hidden="true"
              />
              {regenerating ? "Membuat API key…" : "Buat API key baru"}
            </button>
            <p className="text-xs text-zinc-400">
              Membuat key baru akan menonaktifkan key lama.
            </p>
          </div>
          {feedback && (
            <p role="status" className="break-words text-sm text-zinc-300">
              {feedback}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

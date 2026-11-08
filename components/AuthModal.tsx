"use client";

import React, { useEffect, useRef, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { X, ShieldAlert, KeyRound, Terminal, CheckCircle2, Loader2 } from "lucide-react";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  reason?: string;
}

export default function AuthModal({ isOpen, onClose, reason }: AuthModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current;
    if (isOpen && element && !element.open) element.showModal();
    return () => element?.close();
  }, [isOpen]);

  if (!isOpen) return null;

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const redirectTo = `${window.location.origin}/auth/callback`;

      const { error } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        setError(error.message);
        setLoading(false);
      }
    } catch (err: any) {
      setError(err.message || "Gagal menghubungkan ke layanan Google");
      setLoading(false);
    }
  };

  return (
    <dialog ref={dialog} onCancel={onClose} aria-labelledby="login-title"
      className="w-[calc(100%-2rem)] max-w-md rounded-xl bg-transparent text-zinc-100 backdrop:bg-black/80 backdrop:backdrop-blur-sm">
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface-panel border-2 border-red-600/80 rounded-xl p-6 sm:p-8 shadow-[0_0_50px_rgba(220,38,38,0.35)] space-y-6">
        
        {/* Close Button */}
        <button
          onClick={onClose}
          aria-label="Tutup dialog login"
          className="absolute top-4 right-4 w-8 h-8 rounded border border-surface-border bg-surface hover:bg-red-950/50 hover:border-red-600 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="space-y-2 pr-6">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-red-950/70 border border-red-800 text-red-300 text-[10px] font-mono-code rounded uppercase font-bold">
            <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
            LOGIN REQUIRED · OTENTIKASI WAJIB
          </div>

          <h3 id="login-title" className="font-bebas text-4xl text-white tracking-wide">
            MASUK DENGAN <span className="text-red-600">AKUN GOOGLE</span>
          </h3>

          <p className="text-zinc-400 text-xs font-mono-code leading-relaxed">
            {reason || "Halaman ini memerlukan autentikasi. Masuk untuk mendapatkan API Key instan dan membuka akses penuh ke Playground & Tester."}
          </p>
        </div>

        {/* Features Checklist */}
        <div className="bg-black/60 border border-surface-border rounded-lg p-3.5 space-y-2 text-xs font-mono-code">
          <div className="flex items-center gap-2 text-zinc-300">
            <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>Generate otomatis Production API Key unik</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>Akses penuh tester interaktif semua endpoint</span>
          </div>
          <div className="flex items-center gap-2 text-zinc-300">
            <CheckCircle2 className="w-4 h-4 text-red-500 flex-shrink-0" />
            <span>Gratis 100 request harian (reset tiap 00:00 WIB)</span>
          </div>
        </div>

        {error && (
          <div className="p-3 bg-red-950/80 border border-red-800 rounded text-red-200 text-xs font-mono-code">
            [ERROR]: {error}
          </div>
        )}

        {/* Google OAuth Button */}
        <div className="space-y-3">
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full py-3 px-4 bg-white hover:bg-zinc-100 text-black font-mono-code text-xs font-bold rounded flex items-center justify-center gap-2 sm:gap-3 transition-transform active:scale-95 shadow-lg disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>MENGHUBUNGKAN KE GOOGLE...</span>
              </>
            ) : (
              <>
                {/* Official Google 'G' Icon */}
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span className="tracking-wider">LANJUTKAN DENGAN GOOGLE</span>
              </>
            )}
          </button>

          <p className="text-[10px] text-zinc-500 font-mono-code text-center">
            Dengan masuk, Anda menyetujui Ketentuan Layanan & Kebijakan Kuota RED/API.
          </p>
        </div>

      </div>
    </dialog>
  );
}

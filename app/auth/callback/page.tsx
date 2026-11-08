"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let unsubscribe = () => {};
    const timeout = setTimeout(() => {
      if (!disposed) setErrorMsg("Sesi login belum diterima. Silakan kembali dan coba login lagi.");
    }, 15000);
    const finish = () => {
      if (disposed) return;
      clearTimeout(timeout);
      router.replace("/?tab=profile");
    };
    try {
      const query = new URLSearchParams(window.location.search);
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if (query.has("error") || hash.has("error")) throw new Error("Login Google dibatalkan atau gagal. Silakan coba lagi.");
      const client = getSupabase();
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        if (session) finish();
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void client.auth.getSession().then(({ data, error }) => {
        if (disposed) return;
        if (error) {
          clearTimeout(timeout);
          setErrorMsg("Sesi login tidak valid. Silakan coba lagi.");
        } else if (data.session) finish();
      }).catch(() => {
        if (!disposed) {
          clearTimeout(timeout);
          setErrorMsg("Gagal memproses autentikasi Google.");
        }
      });
    } catch (error) {
      clearTimeout(timeout);
      setErrorMsg(error instanceof Error ? error.message : "Gagal memproses autentikasi Google.");
    }
    return () => {
      disposed = true;
      clearTimeout(timeout);
      unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#08080a] flex flex-col items-center justify-center p-4 font-mono-code text-xs">
      <div className="bg-surface-panel border border-surface-border p-8 rounded-lg max-w-sm w-full text-center space-y-4 shadow-2xl">
        <div className="w-10 h-10 bg-red-600 rounded flex items-center justify-center font-bebas text-2xl text-black font-bold mx-auto">
          R
        </div>

        {errorMsg ? (
          <div className="space-y-2">
            <div className="text-red-400 font-bold uppercase">[AUTENTIKASI GAGAL]</div>
            <p className="text-zinc-400 text-[11px]">{errorMsg}</p>
            <button
              onClick={() => router.replace("/")}
              className="mt-4 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded font-mono-code text-xs"
            >
              Kembali ke Beranda
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <Loader2 className="w-6 h-6 animate-spin text-red-500 mx-auto" />
            <div className="text-zinc-200 font-bold tracking-wider uppercase">
              MEMVERIFIKASI AKUN GOOGLE...
            </div>
            <p className="text-zinc-500 text-[11px]">
              Menghubungkan sesi ke cluster RED/API. Mohon tunggu sebentar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

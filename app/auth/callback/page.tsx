"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function handleAuth() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          setErrorMsg(error.message);
          return;
        }

        if (data?.session) {
          router.replace("/?tab=docs");
        } else {
          // Listen to auth state change if session is being processed from hash
          const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
            if (session) {
              authListener.subscription.unsubscribe();
              router.replace("/?tab=docs");
            }
          });
        }
      } catch (err: any) {
        setErrorMsg(err.message || "Gagal memproses autentikasi Google");
      }
    }

    handleAuth();
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

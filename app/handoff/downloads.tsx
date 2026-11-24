"use client";

import { useEffect, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { portalRequest } from "@/lib/portal-client";

const files = [
  {
    id: "guide",
    title: "Rangkuman serah terima",
    description:
      "Arsitektur, file penting, cara menambah endpoint, dan pekerjaan lanjutan.",
  },
  {
    id: "credentials",
    title: "Templat kredensial",
    description:
      "Daftar PAT, token panel, dan konfigurasi Supabase yang perlu disiapkan.",
  },
] as const;

export default function HandoffDownloads() {
  const [status, setStatus] = useState<
    "loading" | "signed-out" | "denied" | "ready" | "error"
  >("loading");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(10000),
    ]);
    async function check() {
      setStatus("loading");
      try {
        const { data, error: authError } =
          await getSupabase().auth.getSession();
        if (authError) throw authError;
        if (controller.signal.aborted) return;
        if (!data.session) return setStatus("signed-out");
        const response = await fetch("/api/portal/handoff", {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
          signal,
          cache: "no-store",
        });
        if (controller.signal.aborted) return;
        if (response.status === 403) setStatus("denied");
        else if (response.status === 401) setStatus("signed-out");
        else setStatus(response.ok ? "ready" : "error");
      } catch {
        if (!controller.signal.aborted) setStatus("error");
      }
    }
    void check();
    return () => controller.abort();
  }, [retry]);

  async function login() {
    setBusy("login");
    setError("");
    try {
      sessionStorage.setItem("red-api-login-handoff", "1");
      const { error: authError } = await getSupabase().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
    } catch {
      sessionStorage.removeItem("red-api-login-handoff");
      setError("Login Google gagal. Coba lagi.");
      setBusy("");
    }
  }

  async function download(id: string) {
    setBusy(id);
    setError("");
    try {
      const { filename, content } = await portalRequest(`handoff/${id}`);
      const url = URL.createObjectURL(
        new Blob([content], { type: "text/markdown;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unduhan gagal.");
    } finally {
      setBusy("");
    }
  }

  async function switchAccount() {
    setBusy("logout");
    try {
      const { error: authError } = await getSupabase().auth.signOut({
        scope: "local",
      });
      if (authError) throw authError;
      setStatus("signed-out");
    } catch {
      setError("Gagal keluar dari sesi ini. Coba lagi.");
    } finally {
      setBusy("");
    }
  }

  const button =
    "min-h-11 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-50";

  return (
    <main className="mx-auto w-full max-w-2xl space-y-5 px-4 py-10 sm:px-6">
      <a href="/" className="text-sm text-zinc-300 hover:text-white">
        Kembali ke RED API
      </a>
      <section className="space-y-5 rounded-xl border border-surface-border bg-surface-panel p-5 sm:p-8">
        <h1 className="font-bebas text-4xl text-white">
          Unduhan privat RED API
        </h1>
        {status === "loading" && (
          <p role="status" className="text-sm text-zinc-300">
            Memeriksa akses…
          </p>
        )}
        {status === "signed-out" && (
          <button
            type="button"
            disabled={!!busy}
            onClick={login}
            className={button}
          >
            Masuk dengan Google
          </button>
        )}
        {status === "denied" && (
          <div className="space-y-3">
            <p role="status" className="text-sm text-zinc-300">
              Akses tersedia untuk akun pemilik proyek.
            </p>
            <button
              type="button"
              disabled={!!busy}
              onClick={switchAccount}
              className={button}
            >
              Ganti akun
            </button>
          </div>
        )}
        {status === "error" && (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-zinc-300">
              Akses belum dapat diperiksa.
            </p>
            <button
              type="button"
              onClick={() => setRetry(retry + 1)}
              className={button}
            >
              Coba lagi
            </button>
          </div>
        )}
        {status === "ready" &&
          files.map((file) => (
            <article
              key={file.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-surface-border p-4"
            >
              <div className="min-w-0 flex-1 basis-52">
                <h2 className="font-semibold text-white">{file.title}</h2>
                <p className="mt-1 text-sm text-zinc-400">{file.description}</p>
              </div>
              <button
                type="button"
                disabled={!!busy}
                aria-label={`Unduh ${file.title}`}
                onClick={() => void download(file.id)}
                className={button}
              >
                {busy === file.id ? "Mengunduh…" : "Unduh .md"}
              </button>
            </article>
          ))}
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

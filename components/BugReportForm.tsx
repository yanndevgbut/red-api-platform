"use client";

import { useState, type FormEvent } from "react";
import { bugCategories } from "@/lib/bug-reports";
import { portalRequest } from "@/lib/portal-client";

const fieldStyle =
  "w-full rounded-lg border border-surface-border bg-black px-3 py-2 text-sm text-white focus:border-red-500 focus:outline-none";

export default function BugReportForm() {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    setSending(true);
    setError("");
    setReference("");
    try {
      const report = await portalRequest("bug-reports", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setReference(report.id);
      form.reset();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="mx-auto max-w-2xl space-y-5 rounded-xl border border-surface-border bg-surface-panel p-5 sm:p-8">
      <div>
        <h1 className="font-bebas text-4xl text-white">Laporkan Bug</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Ceritakan masalah yang Anda alami di RED API.
        </p>
      </div>
      <form className="space-y-4" onSubmit={submit}>
        <fieldset className="space-y-4" disabled={sending}>
          <label className="block space-y-1 text-sm text-zinc-200">
            <span id="bug-report-category-label">Kategori</span>
            <select
              name="category"
              aria-labelledby="bug-report-category-label"
              defaultValue=""
              required
              className={fieldStyle}
            >
              <option value="" disabled>
                Pilih kategori
              </option>
              {Object.entries(bugCategories).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1 text-sm text-zinc-200">
            <span>Judul laporan</span>
            <input
              name="title"
              required
              minLength={5}
              maxLength={120}
              className={fieldStyle}
            />
          </label>
          <label className="block space-y-1 text-sm text-zinc-200">
            <span>Detail masalah</span>
            <textarea
              name="description"
              required
              minLength={15}
              maxLength={2500}
              rows={6}
              className={fieldStyle}
              aria-describedby="bug-report-help"
            />
          </label>
          <p id="bug-report-help" className="text-xs text-zinc-400">
            Sertakan nama endpoint atau halaman, langkah untuk mengulangi
            masalah, dan pesan error. Hapus API key atau kata sandi dari contoh.
          </p>
          <button
            type="submit"
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:opacity-60"
          >
            {sending ? "Mengirim…" : "Kirim laporan"}
          </button>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        {reference && (
          <p role="status" className="break-all text-sm text-emerald-300">
            Laporan terkirim. ID laporan {reference}.
          </p>
        )}
      </form>
    </section>
  );
}

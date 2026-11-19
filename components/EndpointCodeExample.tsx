"use client";

import { useEffect, useRef, useState } from "react";
import type { Endpoint } from "@/types";
import { Check, Copy } from "lucide-react";
import { requestExample, type ExampleLanguage } from "@/lib/request-examples";

const languages: { value: ExampleLanguage; label: string }[] = [
  { value: "curl", label: "cURL" },
  { value: "javascript", label: "JavaScript" },
  { value: "python", label: "Python" },
];

export default function EndpointCodeExample({
  endpoint,
}: {
  endpoint: Endpoint;
}) {
  const [language, setLanguage] = useState<ExampleLanguage>("curl");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const code = requestExample(endpoint, language);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!code) return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      clearTimeout(timer.current);
      setCopied(true);
      setCopyError("");
      timer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
      setCopyError(
        "Kode belum dapat disalin. Pilih teks lalu salin secara manual.",
      );
    }
  }

  return (
    <section
      aria-label={`Contoh kode ${endpoint.path}`}
      className="min-w-0 space-y-3 border-t border-surface-border pt-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-xs font-mono-code font-bold tracking-wide text-zinc-200">
          CONTOH KODE
        </h3>
        <button
          type="button"
          onClick={copyCode}
          className="inline-flex items-center gap-1.5 rounded border border-surface-border px-3 py-2 text-xs text-zinc-400 hover:border-red-800 hover:text-white"
        >
          {copied ? (
            <Check
              className="h-3.5 w-3.5 text-emerald-400"
              aria-hidden="true"
            />
          ) : (
            <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          {copied ? "Tersalin" : "Salin kode"}
        </button>
      </div>
      <div
        role="group"
        aria-label="Bahasa contoh kode"
        className="flex flex-wrap gap-2"
      >
        {languages.map((item) => (
          <button
            type="button"
            key={item.value}
            aria-pressed={language === item.value}
            onClick={() => {
              setLanguage(item.value);
              setCopied(false);
              setCopyError("");
              clearTimeout(timer.current);
            }}
            className={`rounded border px-3 py-2 text-xs font-mono-code transition-colors ${language === item.value ? "border-red-800 bg-red-950/50 text-red-300" : "border-surface-border bg-surface-card text-zinc-400 hover:text-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">
        Ganti YOUR_API_KEY dengan API key Anda dan sesuaikan nilai parameter.
        Contoh memakai alamat API langsung.
      </p>
      <pre
        tabIndex={0}
        aria-label={`Kode ${language}`}
        className="max-h-[420px] min-w-0 overflow-auto rounded-lg border border-surface-border bg-black/95 p-3.5 text-xs leading-relaxed text-zinc-300"
      >
        <code>{code}</code>
      </pre>
      <p role="status" aria-live="polite" className="text-xs text-zinc-400">
        {copyError || (copied ? "Contoh kode berhasil disalin." : "")}
      </p>
    </section>
  );
}

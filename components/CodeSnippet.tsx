"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CodeSnippet() {
  const [tab, setTab] = useState<"curl" | "node" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const endpoint =
    "https://api.redapi.my.id/api/download/tiktok?url=https://vt.tiktok.com/ZS9ChQ9WD/";
  const snippets = {
    curl: `curl -H "x-api-key: YOUR_KEY" \\
  "${endpoint}"`,
    node: `const res = await fetch('${endpoint}', {
  headers: { 'x-api-key': 'YOUR_KEY' }
});
console.log(await res.json());`,
    python: `import requests
res = requests.get(
    '${endpoint}',
    headers={'x-api-key': 'YOUR_KEY'}
)
print(res.json())`,
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(snippets[tab]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-surface-border bg-surface">
      <div className="bg-surface-card px-4 py-2.5 border-b border-surface-border flex flex-wrap gap-2 items-center justify-between">
        <h2 className="text-sm font-semibold text-white">Contoh request</h2>
        <div className="flex gap-1 text-[11px] font-mono-code">
          {(["curl", "node", "python"] as const).map((t) => (
            <button
              key={t}
              onClick={() => {
                setTab(t);
                setCopied(false);
              }}
              aria-pressed={tab === t}
              className={`px-2 py-0.5 rounded transition-all ${
                tab === t
                  ? "bg-red-950 text-red-300 font-bold border border-red-800"
                  : "text-zinc-400 hover:text-white"
              }`}
            >
              {t === "curl" ? "cURL" : t === "node" ? "Node.js" : "Python"}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 bg-black/60 font-mono-code text-xs text-zinc-300 space-y-3 min-h-[90px]">
        <pre
          tabIndex={0}
          aria-label="Contoh kode API"
          className="overflow-x-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded focus-visible:outline focus-visible:outline-red-400"
        >
          <code>{snippets[tab]}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="ml-auto min-h-9 px-3 py-1 bg-surface-card border border-surface-border rounded text-[10px] text-zinc-300 hover:text-white hover:border-red-600 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              Tersalin
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Salin
            </>
          )}
        </button>
      </div>
    </div>
  );
}

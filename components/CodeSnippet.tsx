"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CodeSnippet() {
  const [tab, setTab] = useState<"curl" | "node" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const endpoint = "https://YOUR_SITE/api/proxy/api/ai/chat?prompt=halo";
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
    <div className="interactive-card min-w-0 bg-surface-panel border border-surface-border rounded-lg overflow-hidden shadow-2xl transition-all hover:border-zinc-700">
      <div className="bg-surface-card px-4 py-2.5 border-b border-surface-border flex flex-wrap gap-2 items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-red-600" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
          <span className="text-xs font-mono-code text-zinc-400 ml-2">Quick Integration</span>
        </div>

        <div className="flex gap-1 text-[11px] font-mono-code">
          {(["curl", "node", "python"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
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
        <pre>
          <code>{snippets[tab]}</code>
        </pre>
        <button
          onClick={handleCopy}
          className="ml-auto px-2 py-1 bg-surface-card border border-surface-border rounded text-[10px] text-zinc-300 hover:text-white hover:border-red-600 transition-colors flex items-center gap-1"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              COPIED
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              COPY
            </>
          )}
        </button>
      </div>

      <div className="p-3 bg-surface-panel border-t border-surface-border flex flex-wrap gap-2 items-center justify-between text-[11px] font-mono-code text-zinc-400">
        <div className="flex items-center gap-2">
          <span className="text-red-400 font-bold">REQUEST EXAMPLE</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-500">ENGINE:</span>
          <span className="text-emerald-400">HTTPS Gateway</span>
        </div>
      </div>
    </div>
  );
}

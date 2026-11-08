"use client";

import React, { useEffect, useState } from "react";
import { Endpoint } from "@/types";
import { ChevronDown, Copy, Check, Loader2, Play } from "lucide-react";
import { API_BASE, isFeaturePath } from "@/lib/api";

export default function DocsAccordion({ defaultKey }: { defaultKey?: string }) {
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCat, setSelectedCat] = useState("ALL");
  const [search, setSearch] = useState("");
  const [activeOpenId, setActiveOpenId] = useState<number | null>(1);

  // Per-endpoint tester state
  const [apiKeys, setApiKeys] = useState<{ [key: number]: string }>({});
  const [paramValues, setParamValues] = useState<{ [key: string]: string }>({});
  const [responses, setResponses] = useState<{ [key: number]: { status: number; latency: number; body: any } }>({});
  const [loadingReq, setLoadingReq] = useState<{ [key: number]: boolean }>({});
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const [catalogError, setCatalogError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadEndpoints() {
      try {
        const res = await fetch("/api/endpoints", { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        if (!res.ok) throw new Error();
        const list: Endpoint[] = await res.json();
        setEndpoints(list);
        setActiveOpenId(list[0]?.id ?? null);
      } catch {
        if (!controller.signal.aborted) setCatalogError("Katalog belum tersedia. Muat ulang halaman untuk mencoba lagi.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadEndpoints();
    return () => controller.abort();
  }, []);

  const categories = ["ALL", "AI Services", "Downloader", "Stalker", "Tools", "WhatsApp"];

  const filteredEndpoints = endpoints.filter((ep) => {
    const matchCat = selectedCat === "ALL" || ep.category === selectedCat;
    const matchSearch =
      ep.name.toLowerCase().includes(search.toLowerCase()) ||
      ep.path.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const handleParamChange = (epId: number, paramName: string, val: string) => {
    setParamValues((prev) => ({
      ...prev,
      [`${epId}_${paramName}`]: val,
    }));
  };

  const handleApiKeyChange = (epId: number, val: string) => {
    setApiKeys((prev) => ({
      ...prev,
      [epId]: val,
    }));
  };

  const executeRequest = async (ep: Endpoint) => {
    const baseUrl = API_BASE;
    const apiKey = (apiKeys[ep.id] ?? defaultKey ?? "").trim();
    if (!apiKey || !isFeaturePath(ep.path) || ep.status !== "active") return;

    setLoadingReq((prev) => ({ ...prev, [ep.id]: true }));
    const startTime = Date.now();

    try {
      let url = `${baseUrl}${ep.path}`;
      const queryParams = new URLSearchParams();

      // Collect params
      if (ep.params && ep.params.length > 0) {
        ep.params.filter(p => p.name !== "apikey").forEach((p) => {
          const val = paramValues[`${ep.id}_${p.name}`] ?? p.default ?? "";
          if (ep.method === "GET") {
            queryParams.append(p.name, val);
          }
        });
      }

      let fetchOptions: RequestInit = {
        method: ep.method,
        headers: {
          "Accept": "application/json",
          "x-api-key": apiKey,
        },
      };

      if (ep.method === "GET") {
        url += `?${queryParams.toString()}`;
      } else {
        const bodyObj: any = {};
        if (ep.params && ep.params.length > 0) {
          ep.params.filter(p => p.name !== "apikey").forEach((p) => {
            bodyObj[p.name] = paramValues[`${ep.id}_${p.name}`] ?? p.default ?? "";
          });
        }
        fetchOptions.headers = {
          ...fetchOptions.headers,
          "Content-Type": "application/json",
        };
        fetchOptions.body = JSON.stringify(bodyObj);
      }

      const res = await fetch(url, { ...fetchOptions, redirect: "error", signal: AbortSignal.timeout(25000) });
      const latency = Date.now() - startTime;
      let body: any;
      try {
        body = await res.json();
      } catch {
        body = { message: "Failed to parse JSON response" };
      }

      setResponses((prev) => ({
        ...prev,
        [ep.id]: { status: res.status, latency, body },
      }));
    } catch (err: any) {
      setResponses((prev) => ({
        ...prev,
        [ep.id]: {
          status: 500,
          latency: Date.now() - startTime,
          body: { error: err.message || "Failed to reach backend node." },
        },
      }));
    } finally {
      setLoadingReq((prev) => ({ ...prev, [ep.id]: false }));
    }
  };

  const copyResponse = async (epId: number, json: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
      setCopiedId(epId);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search & Category Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div>
          <h2 className="font-bebas text-4xl tracking-wide text-white">API EXPLORER & PLAYGROUND</h2>
          <p className="text-xs font-mono-code text-zinc-400">
            Klik endpoint untuk membuka formulir parameter dan test langsung secara inline.
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari endpoint atau path..."
            className="w-full bg-surface-card border border-surface-border px-3 py-2 text-xs font-mono-code text-white rounded focus:outline-none focus:border-red-600 placeholder:text-zinc-600 transition-colors"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 items-center">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCat(cat)}
            aria-pressed={selectedCat === cat}
            className={`px-3 py-1.5 rounded text-xs font-mono-code transition-all ${
              selectedCat === cat
                ? "bg-red-600 text-black font-bold shadow-[0_0_12px_rgba(220,38,38,0.4)]"
                : "bg-surface-card text-zinc-400 border border-surface-border hover:border-zinc-500"
            }`}
          >
            {cat.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Endpoints Accordion */}
      {catalogError ? (
        <p role="status" className="rounded-lg border border-red-900 p-4 text-sm text-red-200">{catalogError}</p>
      ) : loading ? (
        <div className="p-8 text-center text-xs font-mono-code text-zinc-500 flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-red-500" />
          Loading endpoints from Supabase registry...
        </div>
      ) : filteredEndpoints.length === 0 ? (
        <div className="p-8 text-center bg-surface-panel border border-surface-border rounded-lg text-xs font-mono-code text-zinc-500">
          Endpoint tidak ditemukan.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredEndpoints.map((ep) => {
            const isOpen = activeOpenId === ep.id;
            const resData = responses[ep.id];
            const isSubmitting = loadingReq[ep.id] || false;
            const canExecute = isFeaturePath(ep.path) && ["GET", "POST"].includes(ep.method) && ep.status === "active";

            return (
              <div
                key={ep.id}
                className={`bg-surface-panel border ${
                  isOpen
                    ? "border-red-600/80 shadow-[0_0_20px_rgba(220,38,38,0.15)]"
                    : "border-surface-border hover:border-zinc-700"
                } rounded-lg overflow-hidden transition-all duration-200`}
              >
                {/* Header (Click to Toggle) */}
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`endpoint-${ep.id}`}
                  onClick={() => setActiveOpenId(isOpen ? null : ep.id)}
                  className={`w-full text-left p-3 sm:p-4 flex items-start sm:items-center justify-between gap-2 sm:gap-3 ${
                    isOpen ? "bg-surface-card/90" : "bg-surface-panel hover:bg-surface-card/40"
                  } transition-colors`}
                >
                  <div className="flex min-w-0 flex-wrap sm:flex-nowrap items-start gap-2 sm:gap-3">
                    <span
                      className={`shrink-0 px-2.5 py-1 rounded text-xs font-mono-code font-bold ${
                        ep.method === "GET" ? "bg-zinc-800 text-zinc-300" : "bg-red-600 text-black"
                      }`}
                    >
                      {ep.method}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono-code text-sm font-bold text-white">{ep.path}</span>
                        <span
                          className={`text-[10px] font-mono-code px-2 py-0.2 rounded ${
                            ep.min_plan === "vip" || ep.min_plan === "enterprise"
                              ? "bg-red-950 text-red-300 border border-red-800 font-bold"
                              : "bg-zinc-800 text-zinc-400"
                          }`}
                        >
                          {ep.min_plan.toUpperCase()}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 mt-0.5">
                        {ep.name} — {ep.description}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 self-start sm:self-center">
                    <span className="text-[11px] font-mono-code text-zinc-500 hidden md:inline">
                      {ep.category}
                    </span>
                    <div
                      className={`w-7 h-7 rounded border border-surface-border flex items-center justify-center text-xs font-mono-code text-zinc-400 transform transition-transform ${
                        isOpen ? "rotate-180 text-red-400 border-red-800 bg-red-950/40" : ""
                      }`}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </button>

                {/* Accordion Body */}
                <div id={`endpoint-${ep.id}`} inert={!isOpen} className={`accordion-body ${isOpen ? "open" : ""}`}>
                  <div className="accordion-inner">
                    <div className="min-w-0 p-3 sm:p-5 border-t border-surface-border bg-black/60 space-y-5">
                      
                      {/* Host & API Key Row */}
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs font-mono-code">
                        <div className="md:col-span-5 space-y-1">
                          <label className="text-zinc-400">API GATEWAY</label>
                          <input
                            type="text"
                            readOnly
                            aria-label="API gateway"
                            value={API_BASE}
                            className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-zinc-400 focus:outline-none"
                          />
                        </div>

                        <div className="md:col-span-7 space-y-1">
                          <label className="text-zinc-400">AUTHENTICATION (API KEY)</label>
                          <input
                            type="password"
                            autoComplete="off"
                            aria-label="API key"
                            value={apiKeys[ep.id] ?? defaultKey ?? ""}
                            onChange={(e) => handleApiKeyChange(ep.id, e.target.value)}
                            placeholder="Enter your API key..."
                            className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-red-300 focus:outline-none focus:border-red-600"
                          />
                        </div>
                      </div>

                      {/* Parameters Table */}
                      <div className="space-y-2">
                        <div className="text-xs font-mono-code text-zinc-400 flex justify-between">
                          <span>PARAMETERS</span>
                          <span className="text-[10px] text-zinc-500">Auto-mapped into request</span>
                        </div>

                        <div className="border border-surface-border rounded overflow-x-auto">
                          <table className="w-full table-fixed text-left text-xs font-mono-code">
                            <thead className="bg-surface-card text-zinc-400 border-b border-surface-border text-[11px]">
                              <tr>
                                <th className="w-1/4 p-2.5">KEY</th>
                                <th className="w-1/5 p-2.5">TYPE</th>
                                <th className="p-2.5">VALUE</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-surface-border bg-black/40">
                              {ep.params?.some(p => p.name !== "apikey") ? (
                                ep.params.filter(p => p.name !== "apikey").map((p) => (
                                  <tr key={p.name}>
                                    <td className="p-2.5 text-zinc-300">
                                      {p.name}
                                      {p.required && <span className="text-red-500 font-bold ml-1">*</span>}
                                    </td>
                                    <td className="p-2.5 text-zinc-500 text-[10px]">{p.type}</td>
                                    <td className="p-2.5">
                                      <input
                                        type="text"
                                        aria-label={p.name}
                                        value={paramValues[`${ep.id}_${p.name}`] ?? p.default ?? ""}
                                        onChange={(e) => handleParamChange(ep.id, p.name, e.target.value)}
                                        className="w-full bg-surface-card border border-surface-border px-2.5 py-1 text-xs text-white rounded focus:border-red-600 focus:outline-none"
                                      />
                                    </td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td colSpan={3} className="p-3 text-center text-zinc-500">
                                    No parameters required.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>

                      {/* Execution Action Button */}
                      <div className="flex flex-wrap gap-3 items-center justify-between pt-1">
                        <button
                          onClick={() => executeRequest(ep)}
                          disabled={isSubmitting || !canExecute || !(apiKeys[ep.id] ?? defaultKey ?? "").trim()}
                          className="action-button rounded-lg px-4 sm:px-6 py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-black font-bebas text-xl tracking-wider uppercase transition-transform active:scale-95 flex items-center gap-2"
                        >
                          {isSubmitting ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-black" />
                              CONNECTING NODE...
                            </>
                          ) : (
                            <>
                              <Play className="w-4 h-4 fill-black text-black" />
                              EXECUTE REQUEST
                            </>
                          )}
                        </button>

                        {resData && (
                          <div className="flex items-center gap-3 text-xs font-mono-code">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                resData.status === 200
                                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                                  : "bg-red-950 text-red-400 border border-red-800"
                              }`}
                            >
                              {resData.status} {resData.status === 200 ? "OK" : "ERROR"}
                            </span>
                            <span className="text-zinc-500 text-[11px]">{resData.latency}ms</span>
                          </div>
                        )}
                      </div>

                      {!canExecute && <p className="text-xs text-amber-300">Endpoint ini belum dapat diuji melalui playground.</p>}

                      {/* Response Box */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex flex-wrap gap-2 items-center justify-between text-xs font-mono-code text-zinc-400">
                          <span>LIVE RESPONSE OUTPUT:</span>
                          {resData && (
                            <button
                              onClick={() => copyResponse(ep.id, resData.body)}
                              className="text-[11px] text-zinc-400 hover:text-white flex items-center gap-1"
                            >
                              {copiedId === ep.id ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-400" />
                                  COPIED
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  COPY JSON
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        <div className="bg-black/95 border border-surface-border rounded-lg p-3.5 font-mono-code text-xs text-zinc-300 min-h-[140px] max-h-[300px] overflow-auto">
                          <pre className="whitespace-pre-wrap break-words">
                            <code>
                              {resData
                                ? JSON.stringify(resData.body, null, 2)
                                : '// Klik "EXECUTE REQUEST" untuk mengirim request nyata ke node Pterodactyl...'}
                            </code>
                          </pre>
                        </div>
                      </div>

                    </div>
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

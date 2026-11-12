"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { Endpoint } from "@/types";
export default function EndpointRegistry({ endpoints, deleteEndpoint }: { endpoints: Endpoint[]; deleteEndpoint: (id: number) => void }) {
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
      <span>{endpoints.length} endpoint terdaftar</span>
      <Link href="/admin/new-endpoint" className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 font-semibold text-white hover:bg-red-500"><Plus className="h-4 w-4" /> Tambah Endpoint</Link>
    </div>
          <div className="bg-surface-panel border border-surface-border rounded-lg overflow-hidden">
            <div className="p-3 bg-surface-card border-b border-surface-border text-xs font-mono-code text-zinc-400">
              REGISTERED ENDPOINTS
              <span className="mt-1 block text-[10px] text-zinc-500 sm:hidden">Geser tabel untuk melihat kolom lainnya.</span>
            </div>
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel admin, dapat digulir horizontal">
              <table className="w-full min-w-[720px] text-left text-xs font-mono-code">
                <thead className="whitespace-nowrap bg-surface-card/60 text-zinc-400 border-b border-surface-border">
                  <tr>
                    <th className="p-3">METHOD</th>
                    <th className="p-3">PATH</th>
                    <th className="p-3">CATEGORY</th>
                    <th className="p-3">MIN PLAN</th>
                    <th className="p-3">STATUS</th>
                    <th className="p-3 text-right">ACTION</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-border text-zinc-300">
                  {endpoints.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Belum ada endpoint terdaftar.</td></tr>}
                  {endpoints.map((ep) => (
                    <tr key={ep.id} className="hover:bg-surface-card/40">
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ep.method === "GET"
                              ? "bg-zinc-800 text-zinc-300"
                              : "bg-red-950 text-red-300 border border-red-900"
                          }`}
                        >
                          {ep.method}
                        </span>
                      </td>
                      <td className="p-3 text-white font-bold">{ep.path}</td>
                      <td className="p-3 text-zinc-400">{ep.category}</td>
                      <td className="p-3">
                        <span className="px-1.5 py-0.5 rounded bg-zinc-800 text-[10px]">
                          {ep.min_plan.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-bold text-emerald-400">● {ep.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => deleteEndpoint(ep.id)}
                          className="px-2 py-1 bg-red-950/60 hover:bg-red-900 text-red-300 rounded border border-red-800 text-[10px]"
                        >
                          DELETE
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
  </div>;
}

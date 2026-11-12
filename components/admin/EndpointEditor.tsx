"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import type { FormEvent } from "react";
export type EndpointDraft = { name: string; category: string; method: "GET" | "POST"; min_plan: "free" | "basic" | "vip" | "enterprise"; path: string; description: string };
export default function EndpointEditor({ categories, newEp, setNewEp, addEndpoint }: { categories: string[]; newEp: EndpointDraft; setNewEp: (value: EndpointDraft) => void; addEndpoint: (event: FormEvent) => void }) {
  return (
          <form onSubmit={addEndpoint} className="bg-surface-panel border border-surface-border rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <h3 className="font-bebas text-2xl text-white">+ REGISTER NEW ENDPOINT</h3>
              <span className="text-xs font-mono-code text-zinc-500">Live synced into Supabase</span>
            </div>

            {categories.length === 0 && <p className="text-sm text-zinc-400">Tambahkan kategori terlebih dahulu di <Link href="/admin/categories" className="text-red-400 underline">halaman Kategori</Link>.</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-mono-code">
              <div>
                <label className="text-zinc-400 block mb-1">ENDPOINT NAME</label>
                <input
                  type="text"
                  value={newEp.name}
                  onChange={(e) => setNewEp({ ...newEp, name: e.target.value })}
                  placeholder="e.g. YouTube MP4 Downloader"
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">CATEGORY</label>
                <select
                  required
                  disabled={categories.length === 0}
                  value={newEp.category}
                  onChange={(e) => setNewEp({ ...newEp, category: e.target.value })}
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="" disabled>Pilih kategori</option>
                  {categories.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">HTTP METHOD</label>
                <select
                  value={newEp.method}
                  onChange={(e) => setNewEp({ ...newEp, method: e.target.value as EndpointDraft["method"] })}
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="GET">GET</option>
                  <option value="POST">POST</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">MINIMUM PLAN</label>
                <select
                  value={newEp.min_plan}
                  onChange={(e) => setNewEp({ ...newEp, min_plan: e.target.value as EndpointDraft["min_plan"] })}
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="free">Free</option>
                  <option value="basic">Basic</option>
                  <option value="vip">VIP</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="text-zinc-400 block mb-1">ENDPOINT PATH</label>
                <input
                  type="text"
                  value={newEp.path}
                  onChange={(e) => setNewEp({ ...newEp, path: e.target.value })}
                  placeholder="/api/download/youtube"
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-zinc-400 block mb-1">DESCRIPTION</label>
                <input
                  type="text"
                  value={newEp.description}
                  onChange={(e) => setNewEp({ ...newEp, description: e.target.value })}
                  placeholder="Downloads high resolution video stream"
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                disabled={categories.length === 0}
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-black font-bebas text-lg tracking-wider rounded uppercase flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                ADD TO REGISTRY
              </button>
            </div>
          </form>
  );
}

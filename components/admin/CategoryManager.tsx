"use client";
import { useState, type FormEvent } from "react";
import { LoaderCircle, Plus, Tags } from "lucide-react";
import { getSupabase } from "@/lib/supabase";

export default function CategoryManager({ categories, onCreated }: { categories: string[]; onCreated: (categories: string[]) => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const { data, error } = await getSupabase().auth.getSession();
      if (error || !data.session) throw new Error("Login diperlukan.");
      const response = await fetch("/api/categories", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
        body: JSON.stringify({ name: name.trim() }), signal: AbortSignal.timeout(12000),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Gagal menambah kategori.");
      onCreated(result.categories); setName(""); setSuccess("Kategori berhasil ditambahkan.");
    } catch (error) { setError(error instanceof Error ? error.message : "Gagal menambah kategori."); }
    finally { setSaving(false); }
  }
  return <div className="space-y-6">
    <form onSubmit={submit} className="max-w-2xl space-y-4 rounded-xl border border-surface-border bg-surface-panel p-5">
      <div className="flex items-center gap-2 text-white"><Tags className="h-4 w-4 text-red-400" /><h3 className="font-bebas text-2xl">Tambah Kategori</h3></div>
      <p className="text-xs leading-relaxed text-zinc-400">Kategori baru tersedia di DOCS &amp; TESTER dan form endpoint. ALL selalu menampilkan seluruh endpoint.</p>
      <label htmlFor="category-name" className="block text-xs font-mono-code text-zinc-300">Nama kategori</label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input id="category-name" required maxLength={60} value={name} onChange={event => setName(event.target.value)} placeholder="Contoh: Utilities" className="min-w-0 flex-1 rounded-lg border border-surface-border bg-surface-card px-3 py-2.5 text-sm focus:border-red-500 focus:outline-none" />
        <button type="submit" disabled={saving || !name.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {saving ? "Menyimpan..." : "Tambah kategori"}
        </button>
      </div>
      {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
      {success && <p role="status" className="text-sm text-emerald-400">{success}</p>}
    </form>
    <div className="space-y-3 rounded-xl border border-surface-border p-5">
      <h3 className="font-bebas text-2xl text-white">Kategori Tersedia</h3>
      <div className="flex flex-wrap gap-2"><span className="rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-xs text-red-200">ALL · Bawaan</span>{categories.map(category => <span key={category} className="rounded-lg border border-surface-border bg-surface-card px-3 py-2 text-xs text-zinc-200">{category}</span>)}</div>
      {categories.length === 0 && <p className="text-xs text-zinc-500">Belum ada kategori tambahan.</p>}
    </div>
  </div>;
}

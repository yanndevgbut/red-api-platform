"use client";

import React, { useCallback, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { usePollingResource } from "@/lib/use-polling-resource";
import { isFeaturePath } from "@/lib/api";
import { Endpoint, Profile, ApiLog } from "@/types";
import { useRouter } from "next/navigation";
import { adminSections, type AdminSection } from "@/lib/admin-navigation";
import AdminNavigation from "@/components/AdminNavigation";
import EndpointEditor, { type EndpointDraft } from "@/components/admin/EndpointEditor";
import EndpointRegistry from "@/components/admin/EndpointRegistry";
import UserManagement from "@/components/admin/UserManagement";
import AccessLogs from "@/components/admin/AccessLogs";
import CategoryManager from "@/components/admin/CategoryManager";
import SystemSettings from "@/components/admin/SystemSettings";
import { RefreshCw } from "lucide-react";

type AdminSnapshot = { endpoints?: Endpoint[]; users?: Profile[]; logs?: ApiLog[]; maintenance?: boolean; categories?: string[] };

export default function AdminConsole({ section }: { section: AdminSection }) {
  const router = useRouter();
  const current = adminSections.find(item => item.id === section)!;
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [maintenance, setMaintenance] = useState(false);

  // New endpoint form state
  const [newEp, setNewEp] = useState<EndpointDraft>({
    name: "",
    category: "",
    method: "GET" as const,
    min_plan: "free" as const,
    path: "",
    description: "",
  });

  const fetchData = useCallback(async (signal: AbortSignal): Promise<AdminSnapshot> => {
    const client = getSupabase();
    if (section === "new-endpoint" || section === "categories") {
      const response = await fetch("/api/categories", { signal, cache: "no-store" });
      if (!response.ok) throw new Error("Categories unavailable");
      const { categories } = await response.json();
      return { categories };
    }
    if (section === "endpoints") {
      const { data, error } = await client.from("endpoints").select("*").order("id").abortSignal(signal);
      if (error) throw error;
      return { endpoints: data as Endpoint[] };
    }
    if (section === "users") {
      const { data, error } = await client.from("profiles").select("*").order("created_at", { ascending: false }).limit(200).abortSignal(signal);
      if (error) throw error;
      return { users: data as Profile[] };
    }
    if (section === "logs") {
      const { data, error } = await client.from("api_logs").select("*").order("id", { ascending: false }).limit(25).abortSignal(signal);
      if (error) throw error;
      return { logs: data as ApiLog[] };
    }
    const { data, error } = await client.from("system_settings").select("*").eq("id", 1).abortSignal(signal).single();
    if (error) throw error;
    return { maintenance: Boolean(data.maintenance_mode) };
  }, [section]);
  const { data, error, loading, refreshing, reload: loadData } = usePollingResource(fetchData, 8000);

  // Preserve the last successful snapshot if a later refresh fails.
  React.useEffect(() => {
    if (!data) return;
    if (data.categories) setCategories(data.categories);
    if (data.endpoints) setEndpoints(data.endpoints);
    if (data.users) setUsers(data.users);
    if (data.logs) setLogs(data.logs);
    if (data.maintenance !== undefined) setMaintenance(data.maintenance);
  }, [data]);

  const toggleMaintenance = async () => {
    const nextState = !maintenance;
    const { error } = await getSupabase()
      .from("system_settings")
      .update({
        maintenance_mode: nextState,
        maintenance_message: nextState
          ? "System is currently under maintenance. Try again later."
          : "System operational.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);

    if (!error) {
      setMaintenance(nextState);
      alert(`Mode maintenance ${nextState ? "DIAKTIFKAN" : "DIMATIKAN"}`);
    } else {
      alert(`Gagal ubah maintenance: ${error.message}`);
    }
  };

  const addEndpoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categories.includes(newEp.category) || !newEp.name.trim() || !isFeaturePath(newEp.path.trim())) {
      alert("Isi nama dan path API yang valid, misalnya /api/download/tiktok.");
      return;
    }

    const { error } = await getSupabase().from("endpoints").insert({
      name: newEp.name.trim(),
      category: newEp.category,
      method: newEp.method,
      min_plan: newEp.min_plan,
      path: newEp.path.trim(),
      description: newEp.description || "Custom endpoint",
      status: "active",
      params: [],
    });

    if (error) {
      alert(`Gagal menambah endpoint: ${error.message}`);
    } else {
      alert("Endpoint berhasil ditambahkan ke Supabase registry!");
      setNewEp({
        name: "",
        category: "",
        method: "GET",
        min_plan: "free",
        path: "",
        description: "",
      });
      router.push("/admin/endpoints");
    }
  };

  const deleteEndpoint = async (id: number) => {
    if (!confirm("Hapus endpoint ini dari registry?")) return;
    const { error } = await getSupabase().from("endpoints").delete().eq("id", id);
    if (!error) {
      setEndpoints((prev) => prev.filter((e) => e.id !== id));
    }
  };

  const updateUserRole = async (userId: string, role: "user" | "admin") => {
    const { error } = await getSupabase().from("profiles").update({ role }).eq("id", userId);
    if (error) return alert("Gagal memperbarui role.");
    setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, role } : u)));
  };

  const updateUserPlan = async (userId: string, plan: "free" | "basic" | "vip" | "enterprise") => {
    let limit = 100;
    if (plan === "basic") limit = 3000;
    if (plan === "vip") limit = 15000;
    if (plan === "enterprise") limit = 999999;

    const { error } = await getSupabase().from("profiles").update({ plan, limit_daily: limit }).eq("id", userId);
    if (error) return alert("Gagal memperbarui paket.");
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, plan, limit_daily: limit } : u))
    );
  };

  const toggleBanUser = async (userId: string, currentBanned: boolean) => {
    const { error } = await getSupabase().from("profiles").update({ banned: !currentBanned }).eq("id", userId);
    if (error) return alert("Gagal memperbarui status akun.");
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, banned: !currentBanned } : u))
    );
  };

  return (
    <div className="min-w-0 space-y-6">
      <header className="flex items-start gap-3 border-b border-surface-border pb-5 sm:gap-4">
        <AdminNavigation section={section} />
        <div className="min-w-0 space-y-1">
          <p className="font-mono-code text-[10px] tracking-widest text-red-400">RED API · ADMIN</p>
          <h2 className="font-bebas text-3xl text-white sm:text-4xl">{current.title}</h2>
          <p className="text-xs leading-relaxed text-zinc-400">{current.description}</p>
        </div>
      </header>
      {<div role="status" className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono-code text-zinc-400">
        <span>{loading ? "Memuat data panel..." : error || (refreshing ? "Memperbarui data..." : `Data panel tersinkronisasi.${section === "users" ? " Maksimal 200 akun terbaru." : ""}`)}</span>
        <button type="button" onClick={loadData} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Coba lagi / Refresh
        </button>
      </div>}
      <section key={section} aria-label={current.title} className="min-w-0 animate-fade-in">
        {section === "endpoints" && <EndpointRegistry endpoints={endpoints} deleteEndpoint={deleteEndpoint} />}
        {section === "new-endpoint" && <EndpointEditor categories={categories} newEp={newEp} setNewEp={setNewEp} addEndpoint={addEndpoint} />}
        {section === "categories" && <CategoryManager categories={categories} onCreated={names => { setCategories(names); loadData(); }} />}
        {section === "users" && <UserManagement users={users} updateUserRole={updateUserRole} updateUserPlan={updateUserPlan} toggleBanUser={toggleBanUser} />}
        {section === "logs" && <AccessLogs logs={logs} />}
        {section === "settings" && <SystemSettings maintenance={maintenance} disabled={data?.maintenance === undefined} toggleMaintenance={toggleMaintenance} />}
      </section>
    </div>
  );
}

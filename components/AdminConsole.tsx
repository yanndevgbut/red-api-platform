"use client";

import React, { useCallback, useState } from "react";
import { getSupabase } from "@/lib/supabase";
import { usePollingResource } from "@/lib/use-polling-resource";
import { isFeaturePath } from "@/lib/api";
import { Endpoint, Profile } from "@/types";
import { Shield, Plus, Trash2, Power, RefreshCw, AlertTriangle } from "lucide-react";

export default function AdminConsole() {
  const [subTab, setSubTab] = useState<"endpoints" | "users" | "logs">("endpoints");
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [maintenance, setMaintenance] = useState(false);

  // New endpoint form state
  const [newEp, setNewEp] = useState({
    name: "",
    category: "AI Services",
    method: "GET" as const,
    min_plan: "free" as const,
    path: "",
    description: "",
  });

  const fetchData = useCallback(async (signal: AbortSignal) => {
    const client = getSupabase();
    const results = await Promise.all([
      client.from("endpoints").select("*").order("id").abortSignal(signal),
      client.from("profiles").select("*").order("created_at", { ascending: false }).limit(200).abortSignal(signal),
      client.from("api_logs").select("*").order("id", { ascending: false }).limit(25).abortSignal(signal),
      client.from("system_settings").select("*").eq("id", 1).abortSignal(signal).single(),
    ]);
    if (results.some(result => result.error)) throw new Error("Admin data unavailable");
    return { endpoints: results[0].data as Endpoint[], users: results[1].data as Profile[], logs: results[2].data ?? [], maintenance: Boolean(results[3].data?.maintenance_mode) };
  }, []);
  const { data, error, loading, refreshing, reload: loadData } = usePollingResource(fetchData, 8000);

  // Preserve the last successful snapshot if a later refresh fails.
  React.useEffect(() => {
    if (!data) return;
    setEndpoints(data.endpoints);
    setUsers(data.users);
    setLogs(data.logs);
    setMaintenance(data.maintenance);
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
    if (!newEp.name.trim() || !isFeaturePath(newEp.path.trim())) {
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
        category: "AI Services",
        method: "GET",
        min_plan: "free",
        path: "",
        description: "",
      });
      loadData();
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
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-surface-border pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-red-600 text-black text-[10px] font-mono-code font-bold">
              SUPERADMIN
            </span>
            <h2 className="font-bebas text-4xl tracking-wide text-white">MASTER ADMIN CONSOLE</h2>
          </div>
          <p className="text-xs font-mono-code text-zinc-400">
            Sinkronisasi live database Supabase & server Pterodactyl.
          </p>
        </div>

        {/* Global Maintenance Switch */}
        <div className="flex items-center gap-3 bg-surface-card border border-surface-border px-4 py-2 rounded">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono-code text-zinc-300 font-bold">MAINTENANCE MODE</span>
            <span
              className={`text-[10px] font-mono-code ${
                maintenance ? "text-red-400 font-bold" : "text-emerald-400"
              }`}
            >
              STATUS: {maintenance ? "ACTIVE (503)" : "NORMAL"}
            </span>
          </div>
          <button
            onClick={toggleMaintenance}
            disabled={!data}
            className={`px-3 py-1 rounded text-xs font-mono-code transition-colors flex items-center gap-1 ${
              maintenance
                ? "bg-red-600 hover:bg-red-500 text-black font-bold"
                : "bg-zinc-800 hover:bg-zinc-700 text-white border border-zinc-700"
            }`}
          >
            <Power className="w-3.5 h-3.5" />
            TOGGLE
          </button>
        </div>
      </div>

      <div role="status" className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono-code text-zinc-400">
        <span>{loading ? "Memuat data panel..." : error || (refreshing ? "Memperbarui data..." : "Data panel tersinkronisasi. Pengguna: maksimal 200 akun terbaru.")}</span>
        <button type="button" onClick={loadData} disabled={refreshing} className="inline-flex items-center gap-2 rounded border border-surface-border px-3 py-2 disabled:opacity-50">
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} /> Coba lagi / Refresh
        </button>
      </div>

      {/* Subtabs */}
      <div className="flex flex-wrap gap-2 border-b border-surface-border pb-2 text-xs font-mono-code">
        {[
          { id: "endpoints", label: `ENDPOINT REGISTRY (${endpoints.length})` },
          { id: "users", label: `USER MANAGER (${users.length})` },
          { id: "logs", label: "LIVE ACCESS LOGS" },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setSubTab(tab.id as any)}
            className={`px-3 py-1.5 rounded transition-all ${
              subTab === tab.id
                ? "bg-red-950 text-red-300 border border-red-800 font-bold"
                : "text-zinc-400 hover:text-white"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* SUBTAB 1: ENDPOINTS */}
      {subTab === "endpoints" && (
        <div className="space-y-6">
          {/* Add Form */}
          <form onSubmit={addEndpoint} className="bg-surface-panel border border-surface-border rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <h3 className="font-bebas text-2xl text-white">+ REGISTER NEW ENDPOINT</h3>
              <span className="text-xs font-mono-code text-zinc-500">Live synced into Supabase</span>
            </div>

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
                  value={newEp.category}
                  onChange={(e) => setNewEp({ ...newEp, category: e.target.value })}
                  className="w-full bg-surface-card border border-surface-border px-3 py-1.5 rounded text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="AI Services">AI Services</option>
                  <option value="Downloader">Downloader</option>
                  <option value="Stalker">Stalker</option>
                  <option value="Tools">Tools</option>
                  <option value="WhatsApp">WhatsApp</option>
                </select>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">HTTP METHOD</label>
                <select
                  value={newEp.method}
                  onChange={(e) => setNewEp({ ...newEp, method: e.target.value as any })}
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
                  onChange={(e) => setNewEp({ ...newEp, min_plan: e.target.value as any })}
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
                className="px-6 py-2 bg-red-600 hover:bg-red-500 text-black font-bebas text-lg tracking-wider rounded uppercase flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                ADD TO REGISTRY
              </button>
            </div>
          </form>

          {/* Table */}
          <div className="bg-surface-panel border border-surface-border rounded-lg overflow-hidden">
            <div className="p-3 bg-surface-card border-b border-surface-border text-xs font-mono-code text-zinc-400">
              REGISTERED ENDPOINTS
            </div>
            <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel admin, dapat digulir horizontal">
              <table className="w-full text-left text-xs font-mono-code">
                <thead className="bg-surface-card/60 text-zinc-400 border-b border-surface-border">
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
        </div>
      )}

      {/* SUBTAB 2: USERS */}
      {subTab === "users" && (
        <div className="bg-surface-panel border border-surface-border rounded-lg overflow-hidden">
          <div className="p-3 bg-surface-card border-b border-surface-border text-xs font-mono-code text-zinc-400">
            ALL USER PROFILES (SUPABASE AUTH)
          </div>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel admin, dapat digulir horizontal">
            <table className="w-full text-left text-xs font-mono-code">
              <thead className="bg-surface-card text-zinc-400 border-b border-surface-border">
                <tr>
                  <th className="p-3">USERNAME</th>
                  <th className="p-3">EMAIL</th>
                  <th className="p-3">ROLE</th>
                  <th className="p-3">PLAN</th>
                  <th className="p-3">LIMIT REMAINING</th>
                  <th className="p-3">STATUS</th>
                  <th className="p-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border text-zinc-300">
                {users.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-center text-zinc-500">
                      Belum ada user terdaftar.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="hover:bg-surface-card/40">
                      <td className="p-3 font-bold text-white">{u.username}</td>
                      <td className="p-3 text-zinc-400">{u.email}</td>
                      <td className="p-3">
                        <select
                          value={u.role}
                          onChange={(e) => updateUserRole(u.id, e.target.value as any)}
                          className="bg-surface-card border border-surface-border px-1.5 py-0.5 rounded text-[11px] text-zinc-300"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={u.plan}
                          onChange={(e) => updateUserPlan(u.id, e.target.value as any)}
                          className="bg-surface-card border border-surface-border px-1.5 py-0.5 rounded text-[11px] text-zinc-300"
                        >
                          <option value="free">free</option>
                          <option value="basic">basic</option>
                          <option value="vip">vip</option>
                          <option value="enterprise">enterprise</option>
                        </select>
                      </td>
                      <td className="p-3 text-zinc-300">
                        {u.limit_remaining} / {u.limit_daily}
                      </td>
                      <td className="p-3">
                        <span className={`text-[10px] font-bold ${u.banned ? "text-red-500" : "text-emerald-400"}`}>
                          {u.banned ? "BANNED" : "ACTIVE"}
                        </span>
                      </td>
                      <td className="p-3 text-right">
                        <button
                          onClick={() => toggleBanUser(u.id, u.banned)}
                          className="px-2 py-1 bg-surface-card border border-surface-border rounded text-[10px] text-zinc-300 hover:text-white"
                        >
                          {u.banned ? "UNBAN" : "BAN"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: LOGS */}
      {subTab === "logs" && (
        <div className="bg-black border border-surface-border rounded-lg p-4 font-mono-code text-xs text-zinc-300 max-h-[500px] overflow-y-auto">
          <table className="w-full text-left">
            <thead className="text-zinc-500 border-b border-zinc-800 pb-2">
              <tr>
                <th className="py-1">TIME</th>
                <th className="py-1">IP</th>
                <th className="py-1">METHOD</th>
                <th className="py-1">PATH</th>
                <th className="py-1">STATUS</th>
                <th className="py-1">LATENCY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/60">
                  <td className="py-1 text-zinc-500">{new Date(log.created_at).toLocaleTimeString()}</td>
                  <td className="py-1 text-zinc-400">{log.ip_address}</td>
                  <td className={`py-1 font-bold ${log.method === "GET" ? "text-zinc-300" : "text-red-400"}`}>
                    {log.method}
                  </td>
                  <td className="py-1 text-white">{log.endpoint_path}</td>
                  <td className={`py-1 font-bold ${log.status_code === 200 ? "text-emerald-400" : "text-red-400"}`}>
                    {log.status_code}
                  </td>
                  <td className="py-1 text-zinc-400">{log.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

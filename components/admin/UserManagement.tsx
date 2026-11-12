"use client";
import type { Profile } from "@/types";
export default function UserManagement({ users, updateUserRole, updateUserPlan, toggleBanUser }: {
  users: Profile[]; updateUserRole: (id: string, role: Profile["role"]) => void;
  updateUserPlan: (id: string, plan: Profile["plan"]) => void; toggleBanUser: (id: string, banned: boolean) => void;
}) {
  return (
        <div className="bg-surface-panel border border-surface-border rounded-lg overflow-hidden">
          <div className="p-3 bg-surface-card border-b border-surface-border text-xs font-mono-code text-zinc-400">
            ALL USER PROFILES (SUPABASE AUTH)
            <span className="mt-1 block text-[10px] text-zinc-500 sm:hidden">Geser tabel untuk melihat kolom lainnya.</span>
          </div>
          <div className="overflow-x-auto" tabIndex={0} aria-label="Tabel admin, dapat digulir horizontal">
            <table className="w-full min-w-[1000px] text-left text-xs font-mono-code">
              <thead className="whitespace-nowrap bg-surface-card text-zinc-400 border-b border-surface-border">
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
                          onChange={(e) => updateUserRole(u.id, e.target.value as Profile["role"])}
                          className="bg-surface-card border border-surface-border px-1.5 py-0.5 rounded text-[11px] text-zinc-300"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="p-3">
                        <select
                          value={u.plan}
                          onChange={(e) => updateUserPlan(u.id, e.target.value as Profile["plan"])}
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
  );
}

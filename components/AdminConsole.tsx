"use client";

import React, { useCallback, useState } from "react";
import { adminRequest } from "@/lib/admin-client";
import { usePollingResource } from "@/lib/use-polling-resource";
import { isFeaturePath } from "@/lib/api";
import { Endpoint, Profile, ApiLog } from "@/types";
import { useRouter } from "next/navigation";
import { adminSections, type AdminSection } from "@/lib/admin-navigation";
import AdminNavigation from "@/components/AdminNavigation";
import EndpointEditor, {
  type EndpointDraft,
} from "@/components/admin/EndpointEditor";
import EndpointRegistry from "@/components/admin/EndpointRegistry";
import UserManagement from "@/components/admin/UserManagement";
import AccessLogs from "@/components/admin/AccessLogs";
import CategoryManager from "@/components/admin/CategoryManager";
import SystemSettings from "@/components/admin/SystemSettings";
import AnnouncementManager from "@/components/admin/AnnouncementManager";
import PaymentManager from "@/components/admin/PaymentManager";
import { useConfirmation } from "@/components/ActionModal";
import { RefreshCw } from "lucide-react";

type AdminSnapshot = {
  endpoints?: Endpoint[];
  users?: Profile[];
  logs?: ApiLog[];
  maintenance?: boolean;
  categories?: string[];
};

export default function AdminConsole({ section }: { section: AdminSection }) {
  const router = useRouter();
  const { confirm: askConfirm, dialog } = useConfirmation();
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const current = adminSections.find((item) => item.id === section)!;
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

  const fetchData = useCallback(
    async (signal: AbortSignal): Promise<AdminSnapshot> => {
      if (["announcements", "payments"].includes(section)) return {};
      if (section === "new-endpoint" || section === "categories") {
        const response = await fetch("/api/categories", {
          signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Categories unavailable");
        const { categories } = await response.json();
        return { categories };
      }
      if (section === "endpoints")
        return { endpoints: await adminRequest("endpoints", { signal }) };
      if (section === "users")
        return { users: await adminRequest("users", { signal }) };
      if (section === "logs")
        return { logs: await adminRequest("logs", { signal }) };
      const settings = await adminRequest("system", { signal });
      return { maintenance: Boolean(settings.maintenance_mode) };
    },
    [section],
  );
  const {
    data,
    error,
    loading,
    refreshing,
    reload: loadData,
  } = usePollingResource(fetchData, 8000);

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
    if (
      busy ||
      !(await askConfirm({
        title: maintenance
          ? "Nonaktifkan maintenance?"
          : "Aktifkan maintenance?",
        message: maintenance
          ? "Layanan akan dibuka kembali untuk pengguna."
          : "Semua pengguna akan diblokir dari layanan hingga maintenance dinonaktifkan. Admin tetap dapat mengakses panel.",
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      const settings = await adminRequest("maintenance", {
        method: "POST",
        headers: { "X-Confirm-Action": "maintenance" },
        body: JSON.stringify({ active: !maintenance }),
      });
      setMaintenance(Boolean(settings.maintenance_mode));
      loadData();
    } catch {
      setIssue("Gagal memperbarui maintenance.");
    } finally {
      setBusy(false);
    }
  };
  const addEndpoint = async (event: React.FormEvent) => {
    event.preventDefault();
    if (
      !categories.includes(newEp.category) ||
      !newEp.name.trim() ||
      !isFeaturePath(newEp.path.trim())
    ) {
      alert("Isi nama, kategori, dan path API yang valid.");
      return;
    }
    try {
      await adminRequest("endpoints", {
        method: "POST",
        body: JSON.stringify({
          ...newEp,
          name: newEp.name.trim(),
          path: newEp.path.trim(),
          description: newEp.description || "Custom endpoint",
        }),
      });
      router.push("/admin/endpoints");
    } catch {
      alert("Endpoint tidak dapat ditambahkan.");
    }
  };
  const deleteEndpoint = async (id: number) => {
    if (
      busy ||
      !(await askConfirm({
        title: "Hapus endpoint?",
        message:
          "Endpoint akan dihapus dari registry. Tindakan ini tidak dapat dibatalkan melalui panel.",
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      await adminRequest(`endpoints/${id}`, {
        method: "DELETE",
        headers: { "X-Confirm-Action": "delete-endpoint" },
      });
      setEndpoints((items) => items.filter((item) => item.id !== id));
    } catch {
      setIssue("Endpoint tidak dapat dihapus.");
    } finally {
      setBusy(false);
    }
  };
  const updateUser = async (
    id: string,
    changes: Partial<Pick<Profile, "role" | "plan" | "banned">>,
  ) => {
    const target = users.find((user) => user.id === id);
    const action =
      changes.banned !== undefined
        ? changes.banned
          ? "Blokir akun"
          : "Buka blokir akun"
        : changes.role
          ? `Ubah role menjadi ${changes.role}`
          : `Ubah paket menjadi ${changes.plan}`;
    if (
      busy ||
      !(await askConfirm({
        title: "Konfirmasi perubahan akun",
        message: `${action} untuk ${target?.email || id}? Perubahan akan langsung memengaruhi akses pengguna.${changes.plan ? " Perubahan paket manual ini tidak memakai masa aktif otomatis." : ""}`,
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      const updated = await adminRequest(`users/${id}`, {
        method: "PATCH",
        headers: { "X-Confirm-Action": "update-user" },
        body: JSON.stringify(changes),
      });
      setUsers((items) =>
        items.map((user) => (user.id === id ? updated : user)),
      );
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const deleteUser = async (id: string) => {
    const target = users.find((user) => user.id === id);
    if (
      !target ||
      busy ||
      !(await askConfirm({
        title: "Hapus akun permanen?",
        message:
          "Akun, profil, API key, dan bukti transfer pengguna akan dihapus. Tindakan ini tidak dapat dibatalkan.",
        challenge: target.email,
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      await adminRequest(`users/${id}`, {
        method: "DELETE",
        headers: {
          "X-Confirm-Action": "delete-user",
          "X-Confirm-Target": target.email,
        },
      });
      setUsers((items) => items.filter((user) => user.id !== id));
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const updateUserRole = (id: string, role: Profile["role"]) =>
    updateUser(id, { role });
  const updateUserPlan = (id: string, plan: Profile["plan"]) =>
    updateUser(id, { plan });
  const toggleBanUser = (id: string, banned: boolean) =>
    updateUser(id, { banned: !banned });

  return (
    <div className="min-w-0 space-y-6">
      {dialog}
      {issue && (
        <p role="alert" className="text-sm text-red-400">
          {issue}
        </p>
      )}
      <header className="flex items-start gap-3 border-b border-surface-border pb-5 sm:gap-4">
        <AdminNavigation section={section} />
        <div className="min-w-0 space-y-1">
          <p className="font-mono-code text-[10px] tracking-widest text-red-400">
            RED API · ADMIN
          </p>
          <h2 className="font-bebas text-3xl text-white sm:text-4xl">
            {current.title}
          </h2>
          <p className="text-xs leading-relaxed text-zinc-400">
            {current.description}
          </p>
        </div>
      </header>
      {!["announcements", "payments"].includes(section) && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-3 text-xs font-mono-code text-zinc-400"
        >
          <span>
            {loading
              ? "Memuat data panel..."
              : error ||
                (refreshing
                  ? "Memperbarui data..."
                  : `Data panel tersinkronisasi.${section === "users" ? " Maksimal 200 akun terbaru." : ""}`)}
          </span>
          <button
            type="button"
            onClick={loadData}
            disabled={refreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 disabled:opacity-50"
          >
            <RefreshCw
              className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`}
            />{" "}
            Coba lagi / Refresh
          </button>
        </div>
      )}
      <section
        key={section}
        aria-label={current.title}
        className="min-w-0 animate-fade-in"
      >
        {section === "announcements" && <AnnouncementManager />}
        {section === "payments" && <PaymentManager />}
        {section === "endpoints" && (
          <EndpointRegistry
            endpoints={endpoints}
            deleteEndpoint={deleteEndpoint}
          />
        )}
        {section === "new-endpoint" && (
          <EndpointEditor
            categories={categories}
            newEp={newEp}
            setNewEp={setNewEp}
            addEndpoint={addEndpoint}
          />
        )}
        {section === "categories" && (
          <CategoryManager
            categories={categories}
            onCreated={(names) => {
              setCategories(names);
              loadData();
            }}
          />
        )}
        {section === "users" && (
          <UserManagement
            busy={busy}
            deleteUser={deleteUser}
            users={users}
            updateUserRole={updateUserRole}
            updateUserPlan={updateUserPlan}
            toggleBanUser={toggleBanUser}
          />
        )}
        {section === "logs" && <AccessLogs logs={logs} />}
        {section === "settings" && (
          <SystemSettings
            maintenance={maintenance}
            disabled={busy || data?.maintenance === undefined}
            toggleMaintenance={toggleMaintenance}
          />
        )}
      </section>
    </div>
  );
}

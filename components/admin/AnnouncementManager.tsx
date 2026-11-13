"use client";
import { useCallback, useState } from "react";
import {
  portalRequest,
  confirmationHeaders,
  type Announcement,
} from "@/lib/portal-client";
import { usePollingResource } from "@/lib/use-polling-resource";
import { useConfirmation } from "@/components/ActionModal";
export default function AnnouncementManager() {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const { confirm, dialog } = useConfirmation();
  const fetcher = useCallback(
    async (signal: AbortSignal): Promise<Announcement[]> =>
      portalRequest("admin/announcements", { signal }),
    [],
  );
  const { data, error, reload } = usePollingResource(fetcher, 10000);
  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (
      !(await confirm({
        title: "Terbitkan pengumuman?",
        message:
          "Pengumuman ini akan tampil sebagai pop up kepada pengunjung hingga waktu kedaluwarsa.",
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      await portalRequest("admin/announcements", {
        method: "POST",
        body: JSON.stringify({
          title,
          message,
          expiresAt: new Date(expires).toISOString(),
        }),
      });
      setTitle("");
      setMessage("");
      setExpires("");
      reload();
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(item: Announcement) {
    if (
      !(await confirm({
        title: "Hapus pengumuman?",
        message: `“${item.title}” tidak akan ditampilkan lagi. Catatan penerbitannya tetap ada dalam riwayat.`,
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      await portalRequest(`admin/announcements/${item.id}`, {
        method: "DELETE",
        headers: confirmationHeaders("delete-announcement"),
      });
      reload();
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      {dialog}
      <form
        onSubmit={create}
        className="space-y-4 rounded-xl border border-zinc-800 bg-surface-panel p-5"
      >
        <h3 className="font-bebas text-2xl">BUAT PENGUMUMAN</h3>
        <label className="block text-sm">
          Judul
          <input
            required
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
          />
        </label>
        <label className="block text-sm">
          Isi informasi
          <textarea
            required
            maxLength={4000}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3"
          />
        </label>
        <label className="block text-sm">
          Kedaluwarsa (waktu lokal perangkat)
          <input
            required
            type="datetime-local"
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
            className="mt-2 block max-w-full rounded-lg border border-zinc-700 bg-zinc-900 p-3 [color-scheme:dark]"
          />
        </label>
        <button
          disabled={busy}
          className="rounded-lg bg-red-600 px-5 py-3 disabled:opacity-50"
        >
          {busy ? "Memproses..." : "Terbitkan pengumuman"}
        </button>
      </form>
      {(issue || error) && (
        <p role="alert" className="text-sm text-red-400">
          {issue || error}
        </p>
      )}
      <h3 className="font-bebas text-2xl">RIWAYAT PENGUMUMAN</h3>
      {!data && <p role="status">Memuat riwayat...</p>}
      {data?.length === 0 && (
        <p className="text-zinc-500">Belum ada pengumuman.</p>
      )}
      {data?.map((item) => (
        <article
          key={item.id}
          className="space-y-3 rounded-xl border border-zinc-800 p-5"
        >
          <div className="flex flex-wrap justify-between gap-3">
            <h4 className="min-w-0 break-words font-semibold">{item.title}</h4>
            <span className="text-xs text-red-300">
              {item.deletedAt
                ? "Dihapus"
                : Date.parse(item.expiresAt) <= Date.now()
                  ? "Kedaluwarsa"
                  : "Aktif"}
            </span>
          </div>
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-400">
            {item.message}
          </p>
          <p className="text-xs text-zinc-500">
            Dibuat {new Date(item.createdAt!).toLocaleString("id-ID")} ·
            Berakhir {new Date(item.expiresAt).toLocaleString("id-ID")}
          </p>
          {!item.deletedAt && (
            <button
              disabled={busy}
              onClick={() => void remove(item)}
              className="rounded border border-red-900 px-3 py-2 text-sm text-red-400"
            >
              Hapus pengumuman
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

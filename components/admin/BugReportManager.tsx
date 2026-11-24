"use client";

import { useCallback, useState } from "react";
import { bugCategories, type BugReport } from "@/lib/bug-reports";
import { portalRequest } from "@/lib/portal-client";
import { usePollingResource } from "@/lib/use-polling-resource";

type ReportPage = { reports: BugReport[]; hasNext: boolean };

export default function BugReportManager() {
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState<string | null>(null);
  const [issue, setIssue] = useState("");
  const load = useCallback(
    async (signal: AbortSignal): Promise<ReportPage & { page: number }> => ({
      ...(await portalRequest(`admin/bug-reports?page=${page}`, { signal })),
      page,
    }),
    [page],
  );
  const { data, error, reload, refreshing } = usePollingResource(load, 30000);
  const current = data?.page === page ? data : null;

  async function resolve(id: string) {
    setIssue("");
    setSaving(id);
    try {
      await portalRequest(`admin/bug-reports/${id}/resolve`, {
        method: "POST",
        body: "{}",
      });
      reload();
    } catch (err) {
      setIssue((err as Error).message);
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-4">
      {(issue || error) && (
        <p role="alert" className="text-sm text-red-300">
          {issue || error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm text-zinc-300">
        <button
          type="button"
          onClick={reload}
          className="rounded-lg border border-surface-border px-3 py-2"
          disabled={refreshing}
        >
          Muat ulang
        </button>
        <button
          type="button"
          onClick={() => setPage(page - 1)}
          className="disabled:opacity-50"
          disabled={page === 1}
        >
          Sebelumnya
        </button>
        <span>Halaman {page}</span>
        <button
          type="button"
          onClick={() => setPage(page + 1)}
          className="disabled:opacity-50"
          disabled={!current?.hasNext}
        >
          Berikutnya
        </button>
      </div>
      {!current && !error && (
        <p role="status" className="text-sm text-zinc-400">
          Memuat laporan…
        </p>
      )}
      {current?.reports.length === 0 && (
        <p className="text-sm text-zinc-400">
          Belum ada laporan di halaman ini.
        </p>
      )}
      {current?.reports.map((report) => (
        <article
          key={report.id}
          className="min-w-0 space-y-3 rounded-xl border border-surface-border p-4"
        >
          <p className="text-xs text-zinc-400">
            {bugCategories[report.category]} ·{" "}
            {new Date(report.createdAt).toLocaleString("id-ID", {
              timeZone: "Asia/Jakarta",
            })}{" "}
            WIB
          </p>
          <h3 className="break-words font-semibold text-white">
            {report.title}
          </h3>
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-200">
            {report.description}
          </p>
          <p className="break-all text-xs text-zinc-400">
            ID laporan {report.id} · Akun {report.userId || "dihapus"}
          </p>
          {report.status === "resolved" ? (
            <p className="text-sm text-emerald-300">Selesai</p>
          ) : (
            <button
              type="button"
              disabled={Boolean(saving) || refreshing}
              onClick={() => void resolve(report.id)}
              className="rounded-lg border border-surface-border px-3 py-2 text-sm text-zinc-200 disabled:opacity-60"
            >
              {saving === report.id ? "Menyimpan…" : "Tandai selesai"}
            </button>
          )}
        </article>
      ))}
    </div>
  );
}

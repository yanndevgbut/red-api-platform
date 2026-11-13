"use client";
import { useCallback, useState } from "react";
import {
  portalRequest,
  imageFile,
  money,
  confirmationHeaders,
  type Order,
} from "@/lib/portal-client";
import { usePollingResource } from "@/lib/use-polling-resource";
import ActionModal, { useConfirmation } from "@/components/ActionModal";
import PrivateImage from "@/components/PrivateImage";
export default function PaymentManager() {
  const { confirm, dialog } = useConfirmation();
  const [file, setFile] = useState<File>();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);
  const [reason, setReason] = useState("");
  const [history, setHistory] = useState(false);
  const fetcher = useCallback(async (signal: AbortSignal) => {
    const [orders, settings] = await Promise.all([
      portalRequest("admin/orders", { signal }),
      portalRequest("admin/payment-settings", { signal }),
    ]);
    return {
      orders: orders as Order[],
      settings: settings as {
        qrisReady: boolean;
        note: string;
        updatedAt?: string;
      },
    };
  }, []);
  const { data, error, reload } = usePollingResource(fetcher, 10000);
  async function saveQR(e: React.FormEvent) {
    e.preventDefault();
    if (
      !(await confirm({
        title: "Simpan QRIS pembayaran?",
        message:
          "Pastikan kode QR dan rekening penerima benar. Pesanan baru akan menggunakan QRIS ini; pesanan yang sudah dibuat tetap memakai QRIS sebelumnya.",
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      await portalRequest("admin/qris", {
        method: "POST",
        headers: confirmationHeaders("replace-qris"),
        body: JSON.stringify({ image: await imageFile(file), note }),
      });
      setFile(undefined);
      reload();
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function review(action: "approve" | "reject") {
    if (!selected) return;
    if (action === "reject" && !reason.trim()) {
      setIssue("Isi alasan penolakan.");
      return;
    }
    if (
      !(await confirm({
        title:
          action === "approve" ? "Setujui pembayaran?" : "Tolak pembayaran?",
        message:
          action === "approve"
            ? `Pastikan dana ${money(selected.amount)} untuk ${selected.email} benar-benar diterima. Paket ${selected.plan} akan diaktifkan selama ${selected.days} hari.`
            : "Pesanan akan ditutup dan alasan penolakan ditampilkan kepada pelanggan.",
      }))
    )
      return;
    setBusy(true);
    setIssue("");
    try {
      await portalRequest(`admin/orders/${selected.id}/${action}`, {
        method: "POST",
        headers: confirmationHeaders(`${action}-payment`),
        body: JSON.stringify(action === "reject" ? { note: reason } : {}),
      });
      setSelected(null);
      setReason("");
      reload();
    } catch (e) {
      setIssue((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const rows = data?.orders.filter((order) =>
    history
      ? !["awaiting_proof", "submitted", "approving"].includes(order.status)
      : ["awaiting_proof", "submitted", "approving"].includes(order.status),
  );
  return (
    <div className="space-y-6">
      <form
        onSubmit={saveQR}
        className="space-y-4 rounded-xl border border-zinc-800 bg-surface-panel p-5"
      >
        <h3 className="font-bebas text-2xl">PENGATURAN QRIS</h3>
        <p className="text-sm text-zinc-400">
          {data?.settings.qrisReady
            ? "QRIS aktif. Mengunggah gambar baru akan mengganti QRIS untuk pesanan baru."
            : "QRIS belum tersedia. Pembelian paket dinonaktifkan sampai Anda mengunggah QRIS asli."}
        </p>
        {data?.settings.note && (
          <p className="whitespace-pre-wrap break-words text-sm">
            Catatan saat ini: {data.settings.note}
          </p>
        )}
        {data?.settings.qrisReady && (
          <PrivateImage
            key={data.settings.updatedAt}
            path="admin/qris"
            alt="QRIS pembayaran aktif"
          />
        )}
        <label className="block text-sm">
          Gambar QRIS (PNG/JPEG, maksimal 3 MB)
          <input
            required
            type="file"
            accept="image/png,image/jpeg"
            onChange={(e) => setFile(e.target.files?.[0])}
            className="mt-2 block w-full text-xs"
          />
        </label>
        <label className="block text-sm">
          Catatan pembayaran
          <textarea
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3"
          />
        </label>
        <button
          disabled={busy || !file}
          className="rounded bg-red-600 px-4 py-3 disabled:opacity-40"
        >
          {busy ? "Memproses..." : "Simpan QRIS"}
        </button>
      </form>
      {(issue || error) && (
        <p role="alert" className="text-sm text-red-400">
          {issue || error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setHistory(false)}
          aria-pressed={!history}
          className={`rounded border px-4 py-2 ${!history ? "border-red-500" : "border-zinc-700"}`}
        >
          Perlu ditinjau
        </button>
        <button
          onClick={() => setHistory(true)}
          aria-pressed={history}
          className={`rounded border px-4 py-2 ${history ? "border-red-500" : "border-zinc-700"}`}
        >
          Riwayat pembayaran
        </button>
      </div>
      {!data && <p role="status">Memuat pembayaran...</p>}
      {rows?.length === 0 && (
        <p className="text-sm text-zinc-500">
          Belum ada pembayaran pada daftar ini.
        </p>
      )}
      {rows?.map((order) => (
        <button
          key={order.id}
          onClick={() => {
            setSelected(order);
            setReason("");
            setIssue("");
          }}
          className="block w-full space-y-2 rounded-xl border border-zinc-800 p-5 text-left text-sm"
        >
          <span className="block break-words">
            #{order.reference} · {order.email || "Akun dihapus"}
          </span>
          <span className="block text-zinc-400">
            {order.plan} · {money(order.amount)} · {order.status}
          </span>
          <span className="block text-xs text-zinc-500">
            {new Date(order.createdAt).toLocaleString("id-ID")}
          </span>
        </button>
      ))}
      {selected && (
        <ActionModal
          title={`Pesanan #${selected.reference}`}
          onClose={busy ? undefined : () => setSelected(null)}
        >
          <div className="space-y-4 text-sm">
            <p className="break-words">
              {selected.email} · {selected.plan} · {money(selected.amount)}
            </p>
            <p>Status: {selected.status}</p>
            {selected.proofAvailable ? (
              <PrivateImage
                path={`orders/${selected.id}/proof`}
                alt="Bukti transfer pelanggan"
              />
            ) : (
              <p className="text-zinc-500">Bukti transfer belum diunggah.</p>
            )}
            {["submitted", "approving"].includes(selected.status) && (
              <button
                disabled={busy}
                onClick={() => void review("approve")}
                className="rounded bg-emerald-700 px-4 py-3 disabled:opacity-40"
              >
                {selected.status === "approving"
                  ? "Lanjutkan persetujuan"
                  : "Setujui pembayaran"}
              </button>
            )}
            {["awaiting_proof", "submitted"].includes(selected.status) && (
              <>
                <label className="block">
                  Alasan penolakan
                  <textarea
                    maxLength={500}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 p-3"
                  />
                </label>
                <button
                  disabled={busy}
                  onClick={() => void review("reject")}
                  className="rounded border border-red-700 px-4 py-3"
                >
                  Tolak pembayaran
                </button>
              </>
            )}
            {selected.reviewerNote && (
              <p className="break-words">{selected.reviewerNote}</p>
            )}
            {selected.expiresAt && (
              <p>
                Aktif hingga{" "}
                {new Date(selected.expiresAt).toLocaleString("id-ID")}
              </p>
            )}
            {issue && (
              <p role="alert" className="text-red-400">
                {issue}
              </p>
            )}
          </div>
        </ActionModal>
      )}
      {dialog}
    </div>
  );
}

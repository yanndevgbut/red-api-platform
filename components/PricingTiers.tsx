"use client";
import { useCallback, useEffect, useState } from "react";
import ActionModal from "./ActionModal";
import PrivateImage from "./PrivateImage";
import {
  imageFile,
  money,
  portalRequest,
  type Order,
} from "@/lib/portal-client";
const plans = [
  { id: "free", name: "Free", price: 0, daily: 100 },
  { id: "basic", name: "Basic", price: 25000, daily: 3000 },
  { id: "vip", name: "VIP", price: 50000, daily: 15000 },
  { id: "enterprise", name: "Enterprise", price: 150000, daily: 999999 },
];
const labels: Record<string, string> = {
  awaiting_proof: "Menunggu bukti transfer",
  submitted: "Menunggu persetujuan admin",
  approving: "Sedang diproses admin",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Dibatalkan",
};
export default function PricingTiers({
  loggedIn,
  currentPlan,
  qrisReady,
  onLogin,
}: {
  loggedIn: boolean;
  currentPlan: string;
  qrisReady: boolean;
  onLogin: () => void;
}) {
  const [serverPlan, setServerPlan] = useState<string | null>(null);
  const rank = plans.findIndex(
    (plan) => plan.id === (serverPlan || currentPlan),
  );
  const lowerPlan = (id: string) =>
    loggedIn && (rank < 0 || plans.findIndex((plan) => plan.id === id) < rank);
  const [orders, setOrders] = useState<Order[]>([]);
  const [selected, setSelected] = useState<Order | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [proof, setProof] = useState<File>();
  const [expiry, setExpiry] = useState("");
  const reload = useCallback(async () => {
    if (!loggedIn) return;
    try {
      const data = await portalRequest("orders");
      setOrders(data.orders);
      setServerPlan(data.currentPlan || null);
      setExpiry(data.subscription?.expiresAt || "");
      setSelected((previous) =>
        previous
          ? data.orders.find((row: Order) => row.id === previous.id) || null
          : null,
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }, [loggedIn]);
  useEffect(() => {
    void reload();
    if (!loggedIn) {
      setOrders([]);
      setServerPlan(null);
      setSelected(null);
    }
    const timer = setInterval(() => void reload(), 15000);
    return () => clearInterval(timer);
  }, [reload, loggedIn]);
  async function purchase(plan: string) {
    if (!loggedIn) {
      onLogin();
      return;
    }
    if (lowerPlan(plan)) {
      setError("Paket lebih rendah dari paket aktif Anda.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const order = await portalRequest("orders", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      setSelected(order);
      setProof(undefined);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submitProof() {
    if (!selected) return;
    setBusy(true);
    setError("");
    try {
      await portalRequest(`orders/${selected.id}/proof`, {
        method: "POST",
        body: JSON.stringify({ image: await imageFile(proof) }),
      });
      setProof(undefined);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h2 className="font-bebas text-5xl">PILIH PAKET ANDA</h2>
        <p className="mt-3 text-sm text-zinc-400">
          Pembayaran QRIS manual. Paket aktif 30 hari setelah disetujui admin.
        </p>
        {!qrisReady && (
          <p className="mt-3 text-sm text-amber-300">
            Pembayaran belum tersedia. Admin sedang menyiapkan QRIS.
          </p>
        )}
        {expiry && (
          <p className="mt-3 text-sm text-red-300">
            Paket berbayar aktif hingga{" "}
            {new Date(expiry).toLocaleString("id-ID")}
          </p>
        )}
      </div>
      {error && !selected && (
        <p role="alert" className="text-sm text-red-400">
          {error}
        </p>
      )}
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
        {plans.map((plan) => (
          <article
            key={plan.id}
            className="flex min-w-0 flex-col gap-5 rounded-xl border border-surface-border bg-surface-panel p-6"
          >
            <h3 className="font-bebas text-3xl">{plan.name}</h3>
            <p className="font-bebas text-4xl">{money(plan.price)}</p>
            <p className="text-sm text-zinc-400">
              {plan.price ? "30 hari / persetujuan manual" : "Gratis"}
            </p>
            <p className="flex-1 text-sm">
              {plan.daily.toLocaleString("id-ID")} request / hari
              <br />
              <span className="text-xs text-zinc-500">
                Akses mengikuti persyaratan paket setiap endpoint.
              </span>
            </p>
            <button
              disabled={
                plan.id === "free" || busy || !qrisReady || lowerPlan(plan.id)
              }
              onClick={() => void purchase(plan.id)}
              className="rounded-lg bg-red-600 px-4 py-3 disabled:bg-zinc-800 disabled:text-zinc-500"
            >
              {plan.id === "free"
                ? "Paket gratis"
                : lowerPlan(plan.id)
                  ? "Paket lebih rendah"
                  : busy
                    ? "Memproses..."
                    : `Beli ${plan.name}`}
            </button>
          </article>
        ))}
      </div>
      {loggedIn && (
        <section className="space-y-3">
          <h3 className="font-bebas text-2xl">RIWAYAT PEMBAYARAN</h3>
          {!orders.length && (
            <p className="text-sm text-zinc-500">Belum ada pesanan.</p>
          )}
          {orders.map((order) => (
            <button
              key={order.id}
              onClick={() => {
                setSelected(order);
                setError("");
                setProof(undefined);
              }}
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-800 p-4 text-left text-sm"
            >
              <span>
                #{order.reference} · {order.plan} · {money(order.amount)}
              </span>
              <span className="text-zinc-400">
                {labels[order.status] || order.status}
              </span>
            </button>
          ))}
        </section>
      )}
      {selected && (
        <ActionModal
          title={`Pembayaran #${selected.reference}`}
          onClose={
            busy
              ? undefined
              : () => {
                  setSelected(null);
                  setError("");
                }
          }
        >
          <div className="space-y-4 text-sm">
            <p>
              {selected.plan.toUpperCase()} · {selected.days} hari ·{" "}
              <strong>{money(selected.amount)}</strong>
            </p>
            <p className="text-amber-300">
              {labels[selected.status] || selected.status}
            </p>
            {lowerPlan(selected.plan) && (
              <p className="text-red-300">
                Paket pesanan ini lebih rendah dari paket aktif Anda. Pembayaran
                tidak dapat dilanjutkan. Jika sudah membayar, hubungi admin
                untuk tindak lanjut.
              </p>
            )}
            {selected.status === "awaiting_proof" &&
              !lowerPlan(selected.plan) && (
                <>
                  <p>
                    Bayar sesuai nominal melalui QRIS berikut, lalu unggah bukti
                    transfer. Admin akan memeriksa pembayaran sebelum
                    mengaktifkan paket.
                  </p>
                  <PrivateImage
                    path={`orders/${selected.id}/qris`}
                    alt="QRIS pembayaran"
                  />
                  {selected.paymentNote && (
                    <p className="whitespace-pre-wrap break-words">
                      {selected.paymentNote}
                    </p>
                  )}
                  <label className="block">
                    Bukti transfer (PNG/JPEG, maksimal 3 MB)
                    <input
                      className="mt-2 block w-full text-xs"
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={(e) => setProof(e.target.files?.[0])}
                    />
                  </label>
                  <button
                    disabled={busy || !proof}
                    onClick={() => void submitProof()}
                    className="rounded-lg bg-red-600 px-4 py-3 disabled:opacity-40"
                  >
                    {busy ? "Mengirim..." : "Kirim bukti pembayaran"}
                  </button>
                </>
              )}
            {selected.proofAvailable && (
              <PrivateImage
                path={`orders/${selected.id}/proof`}
                alt="Bukti pembayaran Anda"
              />
            )}
            {selected.reviewerNote && (
              <p className="break-words">
                Catatan admin: {selected.reviewerNote}
              </p>
            )}
            {selected.expiresAt && (
              <p>
                Aktif hingga{" "}
                {new Date(selected.expiresAt).toLocaleString("id-ID")}
              </p>
            )}
            {error && (
              <p role="alert" className="text-red-400">
                {error}
              </p>
            )}
          </div>
        </ActionModal>
      )}
    </div>
  );
}

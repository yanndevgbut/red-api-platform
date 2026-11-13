import { getSupabase } from "./supabase";
export type Announcement = {
  id: string;
  title: string;
  message: string;
  expiresAt: string;
  createdAt?: string;
  deletedAt?: string;
};
export type PortalState = {
  maintenance: { active: boolean; message: string };
  announcements: Announcement[];
  qrisReady: boolean;
  serverTime: string;
};
export type Order = {
  id: string;
  reference: string;
  plan: string;
  amount: number;
  days: number;
  status: string;
  createdAt: string;
  expiresAt?: string;
  email?: string;
  reviewerNote?: string;
  paymentNote?: string;
  proofAvailable: boolean;
};
export const money = (value: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
export async function portalRequest(
  path: string,
  init: RequestInit = {},
  image = false,
) {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session) throw new Error("Silakan login terlebih dahulu.");
  const response = await fetch(`/api/portal/${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${data.session.access_token}`,
      ...init.headers,
    },
    cache: "no-store",
    signal: init.signal ?? AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "Permintaan gagal. Coba lagi.");
  }
  return image ? response.blob() : response.json();
}
export async function imageFile(file?: File): Promise<string> {
  if (
    !file ||
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 3 * 1024 * 1024
  )
    throw new Error("Pilih PNG/JPEG maksimal 3 MB.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
export const confirmationHeaders = (action: string) => ({
  "X-Confirm-Action": action,
});

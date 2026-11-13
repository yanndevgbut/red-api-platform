"use client";
import { useEffect, useState } from "react";
import ActionModal from "./ActionModal";
import type { PortalState } from "@/lib/portal-client";
export default function PortalNotices({
  state,
  identity,
}: {
  state: PortalState;
  identity: string;
}) {
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [clock, setClock] = useState(0);
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem(`red-notices:${identity}`) || "[]",
      );
      setDismissed(
        Array.isArray(saved)
          ? saved.filter((item) => typeof item === "string")
          : [],
      );
    } catch {
      setDismissed([]);
    }
  }, [identity]);
  useEffect(() => {
    setClock(Date.parse(state.serverTime));
    const start = performance.now();
    const timer = setInterval(
      () => setClock(Date.parse(state.serverTime) + performance.now() - start),
      1000,
    );
    return () => clearInterval(timer);
  }, [state.serverTime]);
  const current = state.announcements.find(
    (item) =>
      Date.parse(item.expiresAt) > clock && !dismissed.includes(item.id),
  );
  if (!current) return null;
  return (
    <ActionModal
      title={current.title}
      onClose={() => {
        const ids = [...dismissed, current.id].slice(-500);
        setDismissed(ids);
        try {
          localStorage.setItem(`red-notices:${identity}`, JSON.stringify(ids));
        } catch {}
      }}
    >
      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-300">
        {current.message}
      </p>
      <p className="mt-4 text-xs text-zinc-500">
        Berlaku hingga {new Date(current.expiresAt).toLocaleString("id-ID")}
      </p>
    </ActionModal>
  );
}

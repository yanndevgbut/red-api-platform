"use client";

import { useCallback, useEffect, useState } from "react";

// One request at a time. A stalled provider must not leave a panel loading forever.
export function usePollingResource<T>(
  load: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  timeoutMs = 10000,
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);

  useEffect(() => {
    let disposed = false;
    let nextPoll: ReturnType<typeof setTimeout>;
    let active: AbortController;

    async function run() {
      active = new AbortController();
      setRefreshing(true);
      const timeout = setTimeout(() => active.abort(), timeoutMs);
      try {
        const result = await Promise.race([
          Promise.resolve().then(() => load(active.signal)),
          new Promise<never>((_, reject) => active.signal.addEventListener("abort", () => reject(new Error("timeout")), { once: true })),
        ]);
        if (!disposed) {
          setData(result);
          setError("");
        }
      } catch {
        if (!disposed) setError("Data tidak dapat diperbarui. Periksa koneksi atau coba lagi.");
      } finally {
        clearTimeout(timeout);
        if (!disposed) {
          setLoading(false);
          setRefreshing(false);
          nextPoll = setTimeout(run, intervalMs);
        }
      }
    }
    void run();
    return () => {
      disposed = true;
      clearTimeout(nextPoll);
      active?.abort();
    };
  }, [load, intervalMs, timeoutMs, revision]);

  return { data, error, loading, refreshing, reload };
}

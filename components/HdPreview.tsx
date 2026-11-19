"use client";
import { useEffect, useState } from "react";

export default function HdPreview({
  response,
  apiKey,
}: {
  response?: any;
  apiKey?: string;
}) {
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const data = response?.success === true ? response.data : null;
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = "";
    setPreview("");
    setError("");
    setLoading(false);
    const image = data?.image;
    if (!image) return () => controller.abort();
    setLoading(true);
    void (async () => {
      try {
        let blob: Blob;
        if (image.encoding === "base64") {
          if (
            typeof image.base64 !== "string" ||
            image.base64.length > 4 * 1024 * 1024
          )
            throw new Error("Data gambar tidak valid.");
          const bytes = Uint8Array.from(atob(image.base64), (char) =>
            char.charCodeAt(0),
          );
          blob = new Blob([bytes], { type: "image/png" });
        } else {
          const url = new URL(image.url);
          // Never send the user's API key to a URL chosen by a scraper/provider.
          if (
            url.origin !== "https://api.redapi.my.id" ||
            url.pathname !== "/api/tools/hd" ||
            url.username ||
            url.password ||
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
              url.searchParams.get("result") || "",
            ) ||
            [...url.searchParams.keys()].some((key) => key !== "result") ||
            !apiKey
          )
            throw new Error("Alamat unduhan tidak valid.");
          const result = await fetch(url.href, {
            headers: { "x-api-key": apiKey },
            redirect: "error",
            cache: "no-store",
            signal: AbortSignal.any([
              controller.signal,
              AbortSignal.timeout(120000),
            ]),
          });
          if (
            !result.ok ||
            !result.headers.get("content-type")?.startsWith("image/png")
          )
            throw new Error(
              "Hasil tidak tersedia atau kedaluwarsa. Jalankan ulang endpoint.",
            );
          if (Number(result.headers.get("content-length")) > 64 * 1024 * 1024)
            throw new Error("Berkas hasil terlalu besar.");
          const reader = result.body?.getReader();
          if (!reader) throw new Error("Berkas hasil kosong.");
          const chunks: Uint8Array<ArrayBuffer>[] = [];
          let size = 0;
          try {
            while (true) {
              const item = await reader.read();
              if (item.done) break;
              size += item.value.length;
              if (size > 64 * 1024 * 1024) {
                await reader.cancel();
                throw new Error("Berkas hasil terlalu besar.");
              }
              chunks.push(new Uint8Array(item.value));
            }
          } finally {
            reader.releaseLock();
          }
          blob = new Blob(chunks, { type: "image/png" });
        }
        const signature = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
        if (signature.join(",") !== "137,80,78,71,13,10,26,10")
          throw new Error("Berkas hasil bukan PNG yang valid.");
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setPreview(objectUrl);
      } catch (err) {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Gambar belum dapat ditampilkan.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data, apiKey]);
  if (!response)
    return (
      <p className="text-zinc-500">
        Masukkan URL gambar lalu klik EXECUTE REQUEST.
      </p>
    );
  if (!data)
    return (
      <p role="alert" className="break-words text-red-300">
        {String(
          response?.error?.message ||
            (typeof response?.error === "string"
              ? response.error
              : "Gambar belum dapat diproses."),
        )}
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="break-words text-zinc-400">
        HD {data.scale_requested}× · {data.input?.width}×{data.input?.height} →{" "}
        {data.image?.width}×{data.image?.height} px · PNG
      </p>
      {loading && (
        <p role="status" className="motion-safe:animate-pulse text-red-300">
          Memuat hasil HD...
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-300">
          {error}
        </p>
      )}
      {preview && (
        <>
          <div className="max-h-[650px] overflow-auto rounded border border-zinc-800">
            <img
              src={preview}
              alt={`Hasil peningkatan gambar ${data.scale_requested} kali`}
              className="mx-auto block h-auto max-w-full"
            />
          </div>
          <a
            href={preview}
            download="red-api-hd.png"
            className="inline-flex rounded border border-red-800 px-3 py-2 text-red-300 hover:bg-red-950"
          >
            Unduh PNG
          </a>
          <p className="text-[11px] text-zinc-500">
            Hasil disimpan 10 menit dan hanya dapat diakses oleh akun pemilik
            API key.
          </p>
        </>
      )}
    </div>
  );
}

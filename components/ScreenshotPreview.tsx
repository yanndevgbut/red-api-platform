"use client";
import { useEffect, useState } from "react";
import { Download, ExternalLink, ImageIcon } from "lucide-react";
export default function ScreenshotPreview({ response }: { response?: any }) {
  const [imageURL, setImageURL] = useState("");
  const [issue, setIssue] = useState("");
  const data = response?.success === true ? response.data : null;
  useEffect(() => {
    setImageURL("");
    setIssue("");
    let objectURL = "";
    if (!data) return;
    try {
      const image = data.image;
      if (
        image?.mime_type !== "image/png" ||
        image.encoding !== "base64" ||
        typeof image.base64 !== "string" ||
        image.base64.length > 4194304 ||
        !image.base64.length ||
        !/^[A-Za-z0-9+/=]+$/.test(image.base64)
      )
        throw Error();
      const decoded = atob(image.base64);
      const bytes = Uint8Array.from(decoded, (char) => char.charCodeAt(0));
      if (
        bytes.length < 24 ||
        ![137, 80, 78, 71, 13, 10, 26, 10].every(
          (value, index) => bytes[index] === value,
        )
      )
        throw Error();
      objectURL = URL.createObjectURL(new Blob([bytes], { type: "image/png" }));
      setImageURL(objectURL);
    } catch {
      setIssue(
        "Hasil screenshot tidak dapat ditampilkan. Coba jalankan kembali.",
      );
    }
    return () => {
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [data]);
  if (!response)
    return (
      <div className="flex min-h-40 flex-col items-center justify-center gap-3 text-center text-zinc-500">
        <ImageIcon className="h-7 w-7" />
        <p>Isi URL website, pilih perangkat, lalu jalankan screenshot.</p>
      </div>
    );
  if (!data) {
    const error = response.error;
    return (
      <p role="alert" className="break-words p-3 text-sm text-red-300">
        {typeof error?.message === "string"
          ? error.message
          : typeof error === "string"
            ? error
            : typeof response.message === "string"
              ? response.message
              : "Screenshot gagal dibuat. Coba lagi."}
      </p>
    );
  }
  if (issue)
    return (
      <p role="alert" className="p-3 text-sm text-red-300">
        {issue}
      </p>
    );
  const mode = ["desktop", "tablet", "hp"].includes(data.mode)
    ? data.mode
    : "desktop";
  const label = { desktop: "Desktop", tablet: "Tablet", hp: "HP" }[
    mode as "desktop" | "tablet" | "hp"
  ];
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="break-words text-sm font-semibold text-white">
          {typeof data.title === "string" && data.title
            ? data.title
            : "Screenshot website"}
        </p>
        <p className="break-all text-xs text-zinc-500">
          {typeof data.url === "string" ? data.url : ""}
        </p>
        <p className="text-xs text-zinc-400">
          {label} ·{" "}
          {Number.isSafeInteger(data.image?.width) ? data.image.width : "?"} ×{" "}
          {Number.isSafeInteger(data.image?.height) ? data.image.height : "?"}{" "}
          px · {data.full_page ? "Halaman penuh" : "Area layar"}
        </p>
      </div>
      {imageURL ? (
        <>
          <div className="max-h-[65dvh] overflow-auto rounded-lg border border-zinc-700 bg-zinc-900">
            <img
              src={imageURL}
              alt={`Screenshot ${label}`}
              className="mx-auto h-auto max-w-full"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={imageURL}
              download={`red-api-${mode}.png`}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm text-white"
            >
              <Download className="h-4 w-4" />
              Unduh PNG
            </a>
            <a
              href={imageURL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-zinc-700 px-4 py-2 text-sm"
            >
              <ExternalLink className="h-4 w-4" />
              Buka ukuran asli
            </a>
          </div>
        </>
      ) : (
        <p role="status" className="p-3 text-zinc-400">
          Menyiapkan preview gambar...
        </p>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { portalRequest } from "@/lib/portal-client";
export default function PrivateImage({
  path,
  alt,
}: {
  path: string;
  alt: string;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let disposed = false,
      objectUrl = "";
    setUrl("");
    setError("");
    portalRequest(path, {}, true)
      .then((blob) => {
        if (!disposed) {
          objectUrl = URL.createObjectURL(blob);
          setUrl(objectUrl);
        }
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);
  return url ? (
    <img
      src={url}
      alt={alt}
      className="mx-auto max-h-[50dvh] max-w-full rounded-lg bg-white object-contain"
    />
  ) : (
    <p role="status">{error || "Memuat gambar..."}</p>
  );
}

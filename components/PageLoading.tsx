import { LoaderCircle } from "lucide-react";

export default function PageLoading({ message = "Memuat halaman..." }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[70dvh] w-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-red-900/60 bg-red-950/20 shadow-[0_0_40px_-12px_#dc2626]">
        <LoaderCircle aria-hidden="true" className="h-8 w-8 animate-spin text-red-500 motion-reduce:animate-none" />
      </div>
      <div className="space-y-2">
        <p className="font-bebas text-2xl tracking-widest text-white">RED API</p>
        <p className="font-mono-code text-xs text-zinc-400">{message}</p>
      </div>
    </div>
  );
}

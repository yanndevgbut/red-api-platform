import { BrandIcon } from "@/components/BrandLogo";

export default function PageLoading({ message = "Memuat halaman..." }: { message?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-[70dvh] w-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="relative flex h-20 w-20 items-center justify-center">
        <span aria-hidden="true" className="absolute inset-0 animate-spin rounded-full border-2 border-red-950 border-t-red-500 motion-reduce:animate-none" />
        <BrandIcon className="h-14 w-14" decorative />
      </div>
      <div className="space-y-2">
        <p className="font-bebas text-2xl tracking-widest text-white">RED API</p>
        <p className="font-mono-code text-xs text-zinc-400">{message}</p>
      </div>
    </div>
  );
}

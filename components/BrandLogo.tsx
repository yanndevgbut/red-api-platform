import Image from "next/image";

export function BrandIcon({ className = "h-10 w-10", decorative = false }: { className?: string; decorative?: boolean }) {
  return <Image src="/brand/icon-192.png" alt={decorative ? "" : "Logo RED API"} width={192} height={192} unoptimized className={`shrink-0 rounded-lg object-contain ${className}`} />;
}

export function BrandWordmark({ className = "h-14 w-24" }: { className?: string }) {
  return <Image src="/brand/logo.webp" alt="RED API" width={470} height={273} unoptimized className={`shrink-0 object-contain ${className}`} />;
}

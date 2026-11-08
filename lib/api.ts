export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    // If the browser is on HTTPS, use Next.js internal proxy to avoid Mixed Content (HTTP block)
    if (window.location.protocol === "https:") {
      return "/api/proxy";
    }
  }
  return process.env.NEXT_PUBLIC_API_BASE_URL || "http://103.155.224.102:3016";
}

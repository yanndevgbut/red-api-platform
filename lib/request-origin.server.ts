import type { NextRequest } from "next/server";

export function hasForeignOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return false; // Non-browser clients authenticate with an explicit Bearer token.
  try {
    const parsed = new URL(origin);
    // NextURL normalizes loopback names; the HTTP Host is the browser's actual authority.
    return !["https:", "http:"].includes(parsed.protocol) || parsed.host.toLowerCase() !== (req.headers.get("host") || req.nextUrl.host).toLowerCase();
  } catch { return true; }
}

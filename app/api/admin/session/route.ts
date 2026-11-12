import { hasForeignOrigin } from "@/lib/request-origin.server";
import { NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/admin-auth.server";

const options = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict" as const, path: "/admin" };
export async function POST(req: NextRequest) {
  if (hasForeignOrigin(req)) return NextResponse.json({ allowed: false }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  const allowed = await verifyAdminToken(token);
  const response = NextResponse.json({ allowed }, { status: allowed ? 200 : 403, headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(ADMIN_COOKIE, allowed ? token! : "", { ...options, maxAge: allowed ? 3600 : 0 });
  return response;
}
export async function DELETE() {
  const response = NextResponse.json({ allowed: false }, { headers: { "Cache-Control": "private, no-store" } });
  response.cookies.set(ADMIN_COOKIE, "", { ...options, maxAge: 0 });
  return response;
}

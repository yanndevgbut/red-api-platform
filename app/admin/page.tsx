import { redirect } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-auth.server";
export default async function AdminIndex() {
  if (!await hasAdminSession()) redirect("/");
  redirect("/admin/endpoints");
}

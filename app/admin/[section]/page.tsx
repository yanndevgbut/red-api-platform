import { redirect, notFound } from "next/navigation";
import { hasAdminSession } from "@/lib/admin-auth.server";
import Platform from "@/components/Platform";
import { isAdminSection } from "@/lib/admin-navigation";

export default async function AdminPage({ params }: { params: Promise<{ section: string }> }) {
  if (!await hasAdminSession()) redirect("/");
  const { section } = await params;
  if (!isAdminSection(section)) notFound();
  return <Platform key={section} initialTab="admin" adminSection={section} />;
}

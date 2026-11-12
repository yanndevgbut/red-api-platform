import { notFound } from "next/navigation";
import Platform from "@/components/Platform";
import { isAdminSection } from "@/lib/admin-navigation";

export default async function AdminPage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (!isAdminSection(section)) notFound();
  return <Platform key={section} initialTab="admin" adminSection={section} />;
}

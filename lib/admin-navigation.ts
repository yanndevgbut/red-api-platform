export const adminSections = [
  { id: "endpoints", title: "Endpoint Registry", description: "Kelola endpoint yang terdaftar di katalog.", icon: "registry" },
  { id: "new-endpoint", title: "Tambah Endpoint", description: "Daftarkan endpoint baru ke katalog API.", icon: "add" },
  { id: "categories", title: "Kategori", description: "Tambahkan kategori untuk katalog dan endpoint.", icon: "categories" },
  { id: "users", title: "Manajemen Pengguna", description: "Kelola role, paket, dan status akun pengguna.", icon: "users" },
  { id: "logs", title: "Log Akses", description: "Pantau 25 request API terbaru.", icon: "logs" },
  { id: "settings", title: "Pengaturan Sistem", description: "Atur status maintenance layanan API.", icon: "settings" },
] as const;

export type AdminSection = typeof adminSections[number]["id"];
export function isAdminSection(value: string): value is AdminSection {
  return adminSections.some(section => section.id === value);
}

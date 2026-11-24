export const portalNavigation = [
  { id: "landing", label: "Beranda", requiresAccount: false },
  { id: "docs", label: "Dokumentasi", requiresAccount: true },
  { id: "pricing", label: "Paket", requiresAccount: false },
  { id: "profile", label: "Profil & API key", requiresAccount: true },
] as const;

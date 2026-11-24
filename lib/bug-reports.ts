export const bugCategories = {
  endpoint: "Error atau bug endpoint",
  website: "Bug website",
  api: "Bug API",
  other: "Lainnya",
} as const;

export type BugCategory = keyof typeof bugCategories;

export type BugReport = {
  id: string;
  userId: string | null;
  category: BugCategory;
  title: string;
  description: string;
  status: "open" | "resolved";
  createdAt: string;
};

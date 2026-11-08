export const API_BASE = "/api/proxy";

export function isFeaturePath(path: string) {
  return /^\/api\/(ai|download|stalk|tools|whatsapp)\/[a-z0-9_-]+$/.test(path);
}

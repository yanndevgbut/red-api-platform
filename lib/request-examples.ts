import type { Endpoint } from "@/types";
import { isFeaturePath } from "@/lib/api";

export type ExampleLanguage = "curl" | "javascript" | "python";
type Value = string | number | boolean;
const API_ORIGIN = "https://api.redapi.my.id";

const samples: Record<string, Record<string, Value>> = {
  "/api/stalk/stalktt": { username: "tiktok" },
  "/api/download/tiktok": { url: "https://vt.tiktok.com/ZS9ChQ9WD/" },
  "/api/download/fbdl": { url: "https://www.facebook.com/watch/?v=10153231379946729" },
  "/api/download/igdl": { url: "https://www.instagram.com/reel/DfenBL6JaTk/" },
  "/api/download/pindl": {
    url: "https://www.pinterest.com/pin/123456789012345678/",
  },
  "/api/download/ytdl": {
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    quality: 720,
  },
  "/api/stalk/ff": { uid: "12345678" },
  "/api/tools/ssweb": {
    url: "https://red-api-platform.vercel.app/",
    mode: "desktop",
    fullPage: false,
    waitMs: 5000,
  },
  "/api/tools/hd": {
    url: "https://red-api-platform.vercel.app/brand/icon-32.png",
    scale: 4,
  },
};
const shellQuote = (value: string) => "'" + value.replace(/'/g, "'\\''") + "'";
const pythonValue = (value: Value) =>
  typeof value === "boolean"
    ? value
      ? "True"
      : "False"
    : JSON.stringify(value);

export function requestExample(
  endpoint: Endpoint,
  language: ExampleLanguage,
): string {
  if (
    !isFeaturePath(endpoint.path) ||
    !["GET", "POST", "PUT", "DELETE"].includes(endpoint.method)
  )
    return "";
  const url = API_ORIGIN + endpoint.path;
  const entries = (endpoint.params || [])
    .filter((param) => param.name.toLowerCase() !== "apikey")
    .map((param) => {
      const known = samples[endpoint.path];
      const value =
        known && Object.hasOwn(known, param.name)
          ? known[param.name]
          : param.type === "boolean"
            ? false
            : param.type === "number"
              ? 1
              : param.name === "url"
                ? "https://example.com/"
                : `YOUR_${param.name.toUpperCase()}`;
      return [param.name, value] as [string, Value];
    });
  const values = Object.fromEntries(entries);
  const get = endpoint.method === "GET";
  const timeout = ["/api/tools/hd", "/api/download/ytdl"].includes(
    endpoint.path,
  )
    ? 230
    : ["/api/tools/ssweb", "/api/download/igdl"].includes(endpoint.path)
      ? 135
      : endpoint.path === "/api/stalk/stalktt"
        ? 55
        : 30;

  if (language === "curl") {
    const lines = [
      `curl ${get ? "--get" : `--request ${endpoint.method}`} ${shellQuote(url)}`,
      `  --max-time ${timeout}`,
      "  --header 'x-api-key: YOUR_API_KEY'",
    ];
    if (get)
      entries.forEach(([key, value]) =>
        lines.push(`  --data-urlencode ${shellQuote(`${key}=${value}`)}`),
      );
    else {
      lines.push("  --header 'Content-Type: application/json'");
      lines.push(`  --data-raw ${shellQuote(JSON.stringify(values))}`);
    }
    return lines.join(" \\\n");
  }

  if (language === "javascript") {
    const setup =
      get && entries.length
        ? `const params = new URLSearchParams(${JSON.stringify(Object.fromEntries(entries.map(([key, value]) => [key, String(value)])), null, 2)});\nurl.search = params.toString();\n`
        : "";
    return `// Node.js 22+\nconst url = new URL(${JSON.stringify(url)});\n${setup}\nconst response = await fetch(url, {\n  method: ${JSON.stringify(endpoint.method)},\n  headers: {\n    "x-api-key": "YOUR_API_KEY"${get ? "" : ',\n    "Content-Type": "application/json"'}\n  },${get ? "" : `\n  body: JSON.stringify(${JSON.stringify(values, null, 2).replace(/\n/g, "\n  ")}),`}\n  signal: AbortSignal.timeout(${timeout * 1000})\n});\n\nconst result = await response.json();\nif (!response.ok || result.success === false || result.status === false) {\n  throw new Error(result.error?.message || result.message || "Request gagal");\n}\nconsole.log(result);`;
  }

  const params = entries.length
    ? `{\n${entries.map(([key, value]) => `    ${JSON.stringify(key)}: ${get ? JSON.stringify(String(value)) : pythonValue(value)}`).join(",\n")}\n}`
    : "{}";
  return `# pip install requests\nimport requests\n\nresponse = requests.${endpoint.method.toLowerCase()}(\n    ${JSON.stringify(url)},\n    headers={"x-api-key": "YOUR_API_KEY"},\n    ${get ? "params" : "json"}=${params.replace(/\n/g, "\n    ")},\n    timeout=${timeout}\n)\nresponse.raise_for_status()\nresult = response.json()\nif result.get("success") is False or result.get("status") is False:\n    raise RuntimeError(result.get("error") or "Request gagal")\nprint(result)`;
}

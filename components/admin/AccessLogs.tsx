import type { ApiLog } from "@/types";
export default function AccessLogs({ logs }: { logs: ApiLog[] }) {
  return (
        <div className="bg-black border border-surface-border rounded-lg p-4 font-mono-code text-xs text-zinc-300 max-h-[500px] overflow-auto">
          <table className="w-full min-w-[620px] text-left">
            <thead className="text-zinc-500 border-b border-zinc-800 pb-2">
              <tr>
                <th className="py-1">TIME</th>
                <th className="py-1">IP</th>
                <th className="py-1">METHOD</th>
                <th className="py-1">PATH</th>
                <th className="py-1">STATUS</th>
                <th className="py-1">LATENCY</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900">
              {logs.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-zinc-500">Belum ada log akses.</td></tr>}
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-zinc-900/60">
                  <td className="py-1 text-zinc-500">{new Date(log.created_at).toLocaleTimeString()}</td>
                  <td className="py-1 text-zinc-400">{log.ip_address}</td>
                  <td className={`py-1 font-bold ${log.method === "GET" ? "text-zinc-300" : "text-red-400"}`}>
                    {log.method}
                  </td>
                  <td className="py-1 text-white">{log.endpoint_path}</td>
                  <td className={`py-1 font-bold ${log.status_code === 200 ? "text-emerald-400" : "text-red-400"}`}>
                    {log.status_code}
                  </td>
                  <td className="py-1 text-zinc-400">{log.latency_ms}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
  );
}

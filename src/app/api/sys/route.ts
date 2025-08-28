import os from "os";
import { requireAuth } from "@/lib/auth";
import { bytes, percent } from "@/lib/format";

export async function GET(req: Request) {
  const gate = requireAuth(); if (gate instanceof Response) return gate;

  const url = new URL(req.url);
  const asJson = url.searchParams.get("format") === "json";

  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;

  const load = os.loadavg();
  const uptime = os.uptime();
  const cores = os.cpus().length;

  const data = {
    uptimeSeconds: Math.floor(uptime),
    load,
    cpu: { cores }, // (percent provided via /status snapshot)
    memory: { used: memUsed, total: memTotal, percent: memUsed / memTotal * 100 },
    swap: { used: 0, total: 0, percent: 0 },
    disk: { rootPercent: -1 },
  };

  if (asJson) return Response.json(data);

  const lines = [
    `Host • uptime ${formatUptime(data.uptimeSeconds)} • load ${load.map(n => n.toFixed(2)).join(" ")}`,
    `CPU ${cores} cores`,
    `Mem ${bytes(memUsed)} / ${bytes(memTotal)} (${percent(data.memory.percent)})`,
    `Disk / ${data.disk.rootPercent < 0 ? "n/a" : percent(data.disk.rootPercent)}`
  ].join("\n");
  return new Response(lines, { headers: { "content-type": "text/plain" }});
}

function formatUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}
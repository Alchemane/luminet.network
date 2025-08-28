import { requireAuth } from "@/lib/auth";
import { bytes, percent } from "@/lib/format";
import { getCached, startCollectors, takeSnapshot } from "@/lib/collectors";

startCollectors();

function fmtUptime(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  return `${d}d ${h}h`;
}

export async function GET(req: Request) {
  const gate = await requireAuth(); if (gate instanceof Response) return gate;

  const url = new URL(req.url);
  const mode = url.searchParams.get("mode") || "short";

  // ensure arelatively fresh snapshot
  const snap = (getCached() ?? await takeSnapshot());

  if (mode === "json") {
    return Response.json({
      uptime: fmtUptime(snap.uptimeSeconds),
      uptime_seconds: snap.uptimeSeconds,
      load: snap.load,
      cpu: { percent: snap.cpuPercent, cores: snap.cores },
      memory: { used: snap.memUsed, total: snap.memTotal, percent: (snap.memUsed/snap.memTotal)*100 },
      swap: { used: snap.swapUsed, total: snap.swapTotal, percent: snap.swapTotal? (snap.swapUsed/snap.swapTotal)*100 : 0 },
      disk: { mount: "/", percent: snap.diskPercent },
      net: { iface: snap.net.iface, rx_per_sec: snap.net.rxPerSec, tx_per_sec: snap.net.txPerSec },
      services: { up: 3, down: 0 }, // stub; align with /api/services
      build: snap.build,
    });
  }

  if (mode === "long") {
    const lines = [
      `Uptime:      ${fmtUptime(snap.uptimeSeconds)} (${snap.uptimeSeconds}s)`,
      `Load avg:    ${snap.load.map(n => n.toFixed(2)).join(" ")}`,
      `CPU:         ${snap.cpuPercent.toFixed(0)}% avg across ${snap.cores} cores`,
      `Memory:      ${bytes(snap.memUsed)} / ${bytes(snap.memTotal)} (${percent((snap.memUsed/snap.memTotal)*100)})`,
      `Disk root:   ${snap.diskPercent < 0 ? "n/a" : percent(snap.diskPercent)}`,
      `Net (${snap.net.iface}):  ↑ ${bytes(snap.net.txPerSec)}/s ↓ ${bytes(snap.net.rxPerSec)}/s (approx)`,
      `Services:    UP 3 DOWN 0`,
      `Build hash:  ${snap.build.hash} (deployed ${snap.build.deployed_at || "n/a"})`,
    ].join("\n");
    return new Response(lines, { headers: { "content-type": "text/plain" }});
  }

  // short
  const line = [
    "Status •",
    `Uptime ${fmtUptime(snap.uptimeSeconds)}`,
    `| CPU ${snap.cpuPercent.toFixed(0)}%`,
    `| RAM ${bytes(snap.memUsed)}/${bytes(snap.memTotal)} (${percent((snap.memUsed/snap.memTotal)*100)})`,
    `| Disk ${snap.diskPercent < 0 ? "n/a" : percent(snap.diskPercent)}`,
    `| Net ↑ ${bytes(snap.net.txPerSec)}/s ↓ ${bytes(snap.net.rxPerSec)}/s`,
    `| Services UP 3 DOWN 0`,
  ].join(" ");
  return new Response(line, { headers: { "content-type": "text/plain" }});
}
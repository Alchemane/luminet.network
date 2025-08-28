import os from "os";
import fs from "fs";

export type Snap = {
  uptimeSeconds: number;
  load: number[];
  cpuPercent: number;
  cores: number;
  memUsed: number;
  memTotal: number;
  swapUsed: number;
  swapTotal: number;
  diskPercent: number; // root only, placeholder
  net: { iface: string; rxPerSec: number; txPerSec: number };
  build: { hash: string; deployed_at: string };
};

let lastNet: Record<string, { rx: number; tx: number; t: number }> = {};
let cached: Snap | null = null;

function readDiskRootPercent(): number {
  // TODO: replace with real df parser; -1 means "unknown"
  return -1;
}

// short CPU delta over ~200ms
async function cpuPercentInstant(): Promise<number> {
  const a = os.cpus();
  const s1 = a.map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((x, y) => x + y, 0) }));
  await new Promise(r => setTimeout(r, 200));
  const b = os.cpus();
  const s2 = b.map(c => ({ idle: c.times.idle, total: Object.values(c.times).reduce((x, y) => x + y, 0) }));
  let idle = 0, total = 0;
  for (let i = 0; i < s1.length; i++) {
    idle += s2[i].idle - s1[i].idle;
    total += s2[i].total - s1[i].total;
  }
  return total ? (1 - idle / total) * 100 : 0;
}

export async function takeSnapshot(): Promise<Snap> {
  const memTotal = os.totalmem();
  const memFree = os.freemem();
  const memUsed = memTotal - memFree;
  const swapTotal = 0, swapUsed = 0; // TODO: from /proc/meminfo

  // Network rates
  const ifaces = os.networkInterfaces();
  const primary =
    Object.entries(ifaces).find(([, addrs]) => addrs?.some(a => a.family === "IPv4" && !a.internal))?.[0] || "eth0";
  const statsPathRx = `/sys/class/net/${primary}/statistics/rx_bytes`;
  const statsPathTx = `/sys/class/net/${primary}/statistics/tx_bytes`;
  let rx = 0, tx = 0;
  try { rx = Number(fs.readFileSync(statsPathRx, "utf8")); tx = Number(fs.readFileSync(statsPathTx, "utf8")); } catch {}
  const now = Date.now();
  const prev = lastNet[primary];
  let rxPerSec = 0, txPerSec = 0;
  if (prev) {
    const dt = (now - prev.t) / 1000;
    if (dt > 0) {
      rxPerSec = Math.max(0, (rx - prev.rx) / dt);
      txPerSec = Math.max(0, (tx - prev.tx) / dt);
    }
  }
  lastNet[primary] = { rx, tx, t: now };

  const cpuPercent = await cpuPercentInstant();

  cached = {
    uptimeSeconds: Math.floor(os.uptime()),
    load: os.loadavg(),
    cpuPercent,
    cores: os.cpus().length,
    memUsed, memTotal,
    swapUsed, swapTotal,
    diskPercent: readDiskRootPercent(),
    net: { iface: primary, rxPerSec, txPerSec },
    build: {
      hash: process.env.LUMINET_BUILD_HASH || "dev",
      deployed_at: process.env.LUMINET_DEPLOYED_AT || ""
    },
  };
  return cached;
}

let started = false;
export function startCollectors() {
  if (started) return;
  started = true;
  takeSnapshot().catch(() => {});
  setInterval(() => { takeSnapshot().catch(() => {}); }, 10_000);
}

export function getCached(): Snap | null {
  return cached;
}

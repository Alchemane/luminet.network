import { NextResponse } from "next/server";
import si from "systeminformation";
import fs from "fs/promises";
import os from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---- helpers ----
function fmtBytes(b: number) {
  const u = ["B","KB","MB","GB","TB"]; let i=0;
  while (b >= 1024 && i < u.length-1) { b/=1024; i++; }
  return `${b.toFixed(i?1:0)} ${u[i]}`;
}
function dur(s: number){
  const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60);
  return `${d?d+"d ":""}${h}h ${m}m`;
}

// Use OS temp dir (Windows/macOS/Linux safe)
const STATE_DIR  = path.join(os.tmpdir(), "luminet");
const STATE_FILE = path.join(STATE_DIR, "net.json");

// tiny in-memory cache to avoid spamming
let last = { at: 0, payload: null as any };
const TTL = 1500;

// ---- route ----
export async function GET() {
  try {
    const now = Date.now();
    if (last.payload && now - last.at < TTL) {
      return NextResponse.json(last.payload);
    }

    // ensure temp dir exists (fixes Windows 500)
    try { await fs.mkdir(STATE_DIR, { recursive: true }); } catch {}

    const [timeInfo, mem, load, fsizes, stats, ifaces] = await Promise.all([
      si.time(),
      si.mem(),
      si.currentLoad(),
      si.fsSize(),
      si.networkStats(),
      si.networkInterfaces(),
    ]);

    const upIfaces = ifaces.filter(i => i.operstate === "up");
    const primary =
      (upIfaces.find((i: any) => i.default) ?? upIfaces[0] ?? ifaces[0])?.iface ??
      stats[0]?.iface ??
      "eth0";

    const ns = stats.find(s => s.iface === primary) ?? stats[0];
    const rx = ns?.rx_bytes ?? 0;
    const tx = ns?.tx_bytes ?? 0;

    // load prev counters (best effort; tolerate ENOENT)
    let prev = { rx: 0, tx: 0, at: now };
    try { prev = JSON.parse(await fs.readFile(STATE_FILE, "utf8")); } catch {}

    const dt  = Math.max(1, now - (prev.at || now));
    const drx = Math.max(0, rx - (prev.rx || rx));
    const dtx = Math.max(0, tx - (prev.tx || tx));

    // persist new counters (best effort)
    try { await fs.writeFile(STATE_FILE, JSON.stringify({ rx, tx, at: now })); } catch {}

    // totals
    const usedBytes = fsizes.reduce((a, f) => a + f.used, 0);
    const sizeBytes = fsizes.reduce((a, f) => a + f.size, 0);

    const payload = {
      ok: true,
      uptimeSec: timeInfo.uptime,
      uptime: dur(timeInfo.uptime),
      cpu: {
        pct: Math.round(load.currentLoad),            // note capital L
        cores: (load.cpus ?? []).map(c => Math.round(c.load)),
      },
      mem: {
        usedGB: +(mem.active / 1e9).toFixed(2),
        totalGB: +(mem.total  / 1e9).toFixed(2),
        pct: Math.round((mem.active / mem.total) * 100),
      },
      disk: {
        used: fmtBytes(usedBytes),
        total: fmtBytes(sizeBytes),
        pct: sizeBytes ? Math.round((usedBytes / sizeBytes) * 100) : 0,
      },
      net: {
        iface: primary,
        rxTotal: fmtBytes(rx),
        txTotal: fmtBytes(tx),
        // show *rate* over the last window (bytes/s approximate)
        rxDelta: fmtBytes(drx * 1000 / dt),
        txDelta: fmtBytes(dtx * 1000 / dt),
        windowSec: Math.round(dt / 1000),
      },
      generatedAt: now,
    };

    last = { at: now, payload };
    return NextResponse.json(payload);
  } catch (e: any) {
    // surface error text while you’re developing
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
import os from "os";
import { NextResponse } from "next/server";

function pct(n: number) { return Math.round(n * 100); }

export async function GET() {
  // CPU usage approximation over 200ms
  const start = os.cpus();
  await new Promise(r => setTimeout(r, 200));
  const end = os.cpus();

  const loads = end.map((cpu, i) => {
    const s = start[i].times, e = cpu.times;
    const idle = e.idle - s.idle;
    const total = (e.user+e.nice+e.sys+e.irq+e.idle) - (s.user+s.nice+s.sys+s.irq+s.idle);
    return 1 - idle/total;
  });
  const cpu = pct(loads.reduce((a,b)=>a+b,0)/loads.length);

  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  const memPct = pct(used / total);

  const uptime = os.uptime(); // seconds

  return NextResponse.json({
    cpuPct: cpu,
    memPct: memPct,
    memGB: { used: +(used/1e9).toFixed(2), total: +(total/1e9).toFixed(2) },
    uptimeSec: uptime
  });
}
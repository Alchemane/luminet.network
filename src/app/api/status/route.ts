import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KUMA_URL = process.env.KUMA_STATUS_URL!; // http://127.0.0.1:3001/api/status-page/<slug>

type Mon = { id: number|string; name: string; type?: string|null };

function parseList(raw: any): Mon[] {
  if (Array.isArray(raw?.monitors)) {
    return raw.monitors.map((m: any) => ({ id: m.id, name: m.name, type: m.type ?? null }));
  }
  const groups = raw?.publicGroupList ?? raw?.data?.publicGroupList;
  if (Array.isArray(groups)) {
    const out: Mon[] = [];
    for (const g of groups) for (const m of g?.monitorList ?? []) out.push({ id: m.id, name: m.name, type: m.type ?? null });
    return out;
  }
  return [];
}

function pageName(raw: any) {
  return raw?.publicGroupName ?? raw?.config?.title ?? raw?.title ?? raw?.name ?? "Luminet";
}

export async function GET() {
  try {
    if (!KUMA_URL) return NextResponse.json({ ok:false, error:"KUMA_STATUS_URL not set" }, { status:500 });

    // 5s cap so we never hang
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(KUMA_URL, { cache: "no-store", signal: ctl.signal as any });
    clearTimeout(t);

    if (!r.ok) return NextResponse.json({ ok:false, error:`Upstream ${r.status}` }, { status:502 });
    const raw = await r.json();

    const list = parseList(raw);
    const name = pageName(raw);

    return NextResponse.json({
      ok: true,
      name,
      totals: { up: 0, down: 0, maint: 0, all: list.length }, // unknown without heartbeat
      monitors: list.map(m => ({ ...m, status: null, avgPing: null, uptime: null, lastBeat: null })),
      generatedAt: Date.now(),
      note: "Heartbeat disabled/unavailable; showing monitor list only.",
    });
  } catch (e: any) {
    return NextResponse.json({ ok:false, error:String(e?.message ?? e) }, { status:500 });
  }
}

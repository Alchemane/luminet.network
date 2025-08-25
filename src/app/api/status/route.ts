import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KUMA_URL = process.env.KUMA_STATUS_URL;

export async function GET(req: Request) {
  try {
    if (!KUMA_URL) {
      return NextResponse.json({ ok: false, error: "KUMA_STATUS_URL not set" }, { status: 500 });
    }

    const r = await fetch(KUMA_URL, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json({ ok: false, error: `Upstream ${r.status}` }, { status: 502 });
    }

    const raw = await r.json();

    const monitors = (raw?.monitors ?? raw?.data?.monitors ?? []) as any[];
    const beats = raw?.heartbeatList ?? raw?.data?.heartbeatList ?? {};
    const incidents = raw?.incidents ?? raw?.data?.incidents ?? [];
    const name =
      raw?.publicGroupName ?? raw?.title ?? raw?.name ?? raw?.data?.publicGroupName ?? "Luminet";

    const list = monitors.map((m: any) => {
      const hb = Array.isArray(beats?.[m.id]) ? beats[m.id][0] : null;
      return {
        id: m.id,
        name: m.name,
        status: m.status ?? hb?.status ?? 2,
        avgPing: m.avgPing ?? hb?.ping ?? null,
        uptime: m.uptime ?? m.uptime24 ?? null,
        lastBeat: hb?.time ?? null,
      };
    });

    const up = list.filter((x: any) => Number(x.status) === 1).length;
    const down = list.filter((x: any) => Number(x.status) === 0).length;
    const maint = list.filter((x: any) => Number(x.status) === 3).length;

    return NextResponse.json({
      ok: true,
      name,
      totals: { up, down, maint, all: list.length },
      incidents: Array.isArray(incidents) ? incidents.length : 0,
      monitors: list,
      generatedAt: Date.now(),
    });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message ?? err) }, { status: 500 });
  }
}
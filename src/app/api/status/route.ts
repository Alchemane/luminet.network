import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KUMA_URL = process.env.KUMA_STATUS_URL!;

type MonitorLite = {
  id: number | string;
  name: string;
  status?: number | null;
  avgPing?: number | null;
  uptime?: number | null;
  lastBeat?: number | null;
  type?: string | null;
};

function parseMonitorsFromAny(raw: any): MonitorLite[] {
  if (Array.isArray(raw?.monitors)) {
    return raw.monitors.map((m: any) => ({
      id: m.id ?? m.monitor_id ?? m.slug ?? m.name,
      name: m.name ?? `Monitor ${m.id}`,
      status: m.status ?? null,
      avgPing: m.avgPing ?? null,
      uptime: m.uptime ?? m.uptime24 ?? null,
      type: m.type ?? null,
    }));
  }

  const groups = raw?.publicGroupList ?? raw?.data?.publicGroupList;
  if (Array.isArray(groups)) {
    const list: MonitorLite[] = [];
    for (const g of groups) {
      for (const m of g?.monitorList ?? []) {
        list.push({
          id: m.id,
          name: m.name,
          type: m.type ?? null,
          status: null,
          avgPing: null,
          uptime: null,
        });
      }
    }
    return list;
  }

  return [];
}

function pickName(raw: any) {
  return (
    raw?.publicGroupName ??
    raw?.config?.title ??
    raw?.title ??
    raw?.name ??
    "Luminet"
  );
}

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
    let monitors = parseMonitorsFromAny(raw);
    const name = pickName(raw);

    const missingStatus = monitors.every((m) => m.status == null);
    if (missingStatus) {
      try {
        // derive heartbeat url: `${origin}/api/status-page/heartbeat?slug=<slug>`
        const u = new URL(KUMA_URL);
        const m = u.pathname.match(/\/api\/status-page\/([^/?#]+)/);
        const slug = m?.[1];
        if (slug) {
          u.pathname = "/api/status-page/heartbeat";
          u.search = `?slug=${encodeURIComponent(slug)}`;
          const hbRes = await fetch(u.toString(), { cache: "no-store" });
          if (hbRes.ok) {
            const hb = await hbRes.json() as any;
            const hbMap: Record<string | number, any[]> =
              hb?.heartbeatList ?? hb?.data?.heartbeatList ?? {};

            const mIndex: Record<string | number, any> = {};
            for (const k of ["monitors", "monitorList"]) {
              const arr = (hb as any)?.[k] ?? (hb as any)?.data?.[k];
              if (Array.isArray(arr)) {
                for (const mm of arr) mIndex[mm.id] = mm;
              }
            }

            monitors = monitors.map((m0) => {
              const beats = hbMap?.[m0.id];
              const last = Array.isArray(beats) ? beats[0] : null;
              const fromIdx = mIndex[m0.id] ?? {};
              return {
                ...m0,
                status:
                  fromIdx.status ??
                  last?.status ??
                  m0.status ??
                  null,
                avgPing:
                  fromIdx.avgPing ??
                  last?.ping ??
                  m0.avgPing ??
                  null,
                lastBeat: last?.time ?? last?.timestamp ?? null,
              };
            });
          }
        }
      } catch {
        // heartbeat enrichment errors
      }
    }

    const up = monitors.filter((x) => Number(x.status) === 1).length;
    const down = monitors.filter((x) => Number(x.status) === 0).length;
    const maint = monitors.filter((x) => Number(x.status) === 3).length;

    return NextResponse.json({
      ok: true,
      name,
      totals: { up, down, maint, all: monitors.length },
      incidents: Array.isArray(raw?.incidents) ? raw.incidents.length : 0,
      monitors,
      generatedAt: Date.now(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message ?? e) }, { status: 500 });
  }
}
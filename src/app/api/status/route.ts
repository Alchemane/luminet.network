// src/app/api/status/route.ts
import { NextResponse } from "next/server";

/**
 * Expects process.env.KUMA_STATUS_URL to point to:
 *   e.g. https://<your-kuma>/api/status-page/<slug>
 * or to a reverse-proxied JSON that returns the same structure.
 */
export async function GET() {
  const url = process.env.KUMA_STATUS_URL;
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "KUMA_STATUS_URL not set" },
      { status: 500 }
    );
  }

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return NextResponse.json(
        { ok: false, error: `Upstream responded ${r.status}` },
        { status: 502 }
      );
    }
    const raw = await r.json();

    // ---- Tolerant parsing across Kuma versions ----
    const monitors = (raw?.monitors ?? raw?.data?.monitors ?? []) as any[];
    const heartbeats = raw?.heartbeatList ?? raw?.data?.heartbeatList ?? {};
    const incidents = raw?.incidents ?? raw?.data?.incidents ?? [];
    const publicName =
      raw?.publicGroupName ??
      raw?.title ??
      raw?.name ??
      raw?.data?.publicGroupName ??
      "Luminet";

    // Build a compact status model per monitor
    type MonitorLite = {
      id: number | string;
      name: string;
      status: number; // 0=DOWN,1=UP,2=PENDING,3=MAINT
      url?: string;
      tags?: { name?: string }[];
      lastBeat?: number; // unix ms
      avgPing?: number | null;
      uptime?: number | null; // percent 0..100 if available
    };

    const list: MonitorLite[] = monitors.map((m: any) => {
      const hb = Array.isArray(heartbeats?.[m.id])
        ? heartbeats[m.id][0]
        : null;

      return {
        id: m.id ?? m.monitor_id ?? m.slug ?? m.name,
        name: m.name ?? m.title ?? `Monitor ${m.id}`,
        status:
          m.status ??
          hb?.status ??
          m.maintenance ?? 1, // default UP if unknown
        url: m.url ?? m.hostname ?? undefined,
        tags: m.tags ?? [],
        lastBeat: hb?.time ?? hb?.datetime ?? hb?.timestamp ?? null,
        avgPing: m.avgPing ?? m.avg_response ?? hb?.ping ?? null,
        uptime:
          m.uptime ?? m.uptime24 ?? m.uptimeDay ?? m.uptimeWeek ?? null,
      };
    });

    const up = list.filter((x) => Number(x.status) === 1).length;
    const down = list.filter((x) => Number(x.status) === 0).length;
    const maint = list.filter((x) => Number(x.status) === 3).length;

    return NextResponse.json(
      {
        ok: true,
        name: publicName,
        totals: { up, down, maint, all: list.length },
        incidents: Array.isArray(incidents) ? incidents.length : 0,
        monitors: list,
        generatedAt: Date.now(),
      },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
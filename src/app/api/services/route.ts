import { requireAuth } from "@/lib/auth";

export async function GET() {
  const gate = await requireAuth();
  if (gate instanceof Response) return gate;

  const url = process.env.KUMA_STATUS_URL;
  if (!url) {
    return Response.json({
      ok: true,
      totals: { up: 0, down: 0, maint: 0, all: 0 },
      monitors: [],
      note: "KUMA_STATUS_URL not set; returning empty list."
    });
  }

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    return Response.json({ ok: true, ...data });
  } catch (err: any) {
    return Response.json(
      { ok: false, error: String(err?.message || err) },
      { status: 502 }
    );
  }
}
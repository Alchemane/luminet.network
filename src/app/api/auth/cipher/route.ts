import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

// --- simple in-memory rate limit: 5 tries/min/IP ---
const hits = new Map<string, { count: number; ts: number }>();
const WINDOW_MS = 60_000;
const MAX_TRIES = 5;
function rateLimit(ip: string) {
  const now = Date.now();
  const rec = hits.get(ip) ?? { count: 0, ts: now };
  if (now - rec.ts > WINDOW_MS) { rec.count = 0; rec.ts = now; }
  rec.count++; hits.set(ip, rec);
  return rec.count <= MAX_TRIES;
}
// ---------------------------------------------------

export async function POST(req: Request) {
  // rate limiting
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "local").split(",")[0].trim();
  if (!rateLimit(ip)) return NextResponse.json({ ok: false, reason: "RATE_LIMIT" }, { status: 429 });

  const { cipher } = await req.json().catch(() => ({ cipher: "" }));
  const hash = process.env.LUMEN_CIPHER_HASH;

  if (!hash) return NextResponse.json({ ok: false }, { status: 500 });
  if (!cipher) return NextResponse.json({ ok: false }, { status: 400 });

  const match = bcrypt.compareSync(cipher, hash);
  if (!match) return NextResponse.json({ ok: false }, { status: 401 });

  const res = NextResponse.json({ ok: true });
  res.cookies.set("lumenCipher", "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });
  return res;
}
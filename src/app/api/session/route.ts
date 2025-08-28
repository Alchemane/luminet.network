import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

export async function GET() {
  const store = await cookies();
  const raw = store.get("luminet_auth")?.value;
  if (!raw) return Response.json({ authenticated: false });
  try {
    const decoded = jwt.decode(raw) as any;
    const expIso = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : null;
    return Response.json({ authenticated: true, sub: decoded?.sub ?? null, role: decoded?.role ?? null, exp: expIso });
  } catch { return Response.json({ authenticated: false }); }
}
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";

const COOKIE_NAME = "luminet_auth";
const TTL_SECONDS = 60 * 60 * 12;

export function signSession(payload: { sub: string; role: string }) {
  return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: TTL_SECONDS });
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  const secure = (process.env.COOKIE_SECURE ?? "true") !== "false";
  store.set({ name: COOKIE_NAME, value: token, httpOnly: true, sameSite: "strict", secure, path: "/", maxAge: TTL_SECONDS });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function requireAuth(): Promise<{ ok: true } | Response> {
  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return new Response("Unauthorized", { status: 401 });
  try { jwt.verify(token, process.env.JWT_SECRET!); return { ok: true }; }
  catch { return new Response("Unauthorized", { status: 401 }); }
}
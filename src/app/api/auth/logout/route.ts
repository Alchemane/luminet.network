import { clearSessionCookie } from "@/lib/auth";
export async function POST() {
  clearSessionCookie();
  return new Response("OK");
}
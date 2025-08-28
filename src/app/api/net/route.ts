import os from "os";
import { requireAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const gate = await requireAuth();                 // ← await it
  if (gate instanceof Response) return gate;

  const url = new URL(req.url);
  const asJson = url.searchParams.get("format") === "json";
  const ifaceParam = url.searchParams.get("iface");

  const ifs = os.networkInterfaces();
  const choose =
    (ifaceParam && ifs[ifaceParam]) ||
    Object.entries(ifs).find(([, addrs]) => addrs?.some(a => a.family === "IPv4" && !a.internal))?.[0] ||
    "lo";

  const addrs = ifs[choose] || [];
  const ipv4 = addrs.find(a => a?.family === "IPv4")?.address || "n/a";

  const data = {
    iface: choose,
    ip: ipv4,
    gateway: "n/a",
    dns: [] as string[],
    rates: { rxPerSec: null as number | null, txPerSec: null as number | null },
  };

  if (asJson) {
    return Response.json(data);
  }

  const lines = [
    `Net • iface ${data.iface} • IP ${data.ip} • GW ${data.gateway} • DNS ${data.dns.join(", ") || "n/a"}`
  ].join("\n");

  return new Response(lines, { headers: { "content-type": "text/plain" } });
}
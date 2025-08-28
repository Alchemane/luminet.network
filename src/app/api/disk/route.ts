import { requireAuth } from "@/lib/auth";

export async function GET(req: Request) {
  const gate = requireAuth(); if (gate instanceof Response) return gate;
  const url = new URL(req.url);
  const asJson = url.searchParams.get("format") === "json";

  const data = { mounts: [{ mount: "/", used: -1, total: -1, percent: -1 }] };

  if (asJson) return Response.json(data);
  return new Response("Disk • / n/a", { headers: { "content-type": "text/plain" }});
}
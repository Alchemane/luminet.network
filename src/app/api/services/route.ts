import { requireAuth } from "@/lib/auth";

// TODO: wire to Kumas API or internal registry
export async function GET(req: Request) {
  const gate = requireAuth(); if (gate instanceof Response) return gate;
  const url = new URL(req.url);
  const asJson = url.searchParams.get("format") === "json";
  const data = {
    total: 3,
    up: 3,
    down: 0,
    services: [
      { name: "luminet-web", status: "up" },
      { name: "api-ping", status: "up" },
      { name: "kuma", status: "up" },
    ]
  };
  if (asJson) return Response.json(data);
  return new Response(`Services • UP ${data.up} DOWN ${data.down} (total ${data.total})`, { headers: { "content-type": "text/plain" }});
}
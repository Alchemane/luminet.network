import { requireAuth } from "@/lib/auth";
import { promisify } from "node:util";
import { execFile as _execFile } from "node:child_process";
const execFile = promisify(_execFile);

export async function GET(req: Request) {
  const gate = await requireAuth();
  if (gate instanceof Response) return gate;

  try {
    // df -k /  => parse the second line (filesystem summary for root)
    const { stdout } = await execFile("df", ["-k", "/"]);
    const lines = stdout.trim().split("\n");
    if (lines.length < 2) return Response.json({ ok: false, error: "df output unexpected" }, { status: 500 });

    const parts = lines[1].trim().split(/\s+/);
    const fs = parts[0];
    const total_kb = parseInt(parts[1], 10);
    const used_kb  = parseInt(parts[2], 10);
    const avail_kb = parseInt(parts[3], 10);
    const used_pct = parseInt(parts[4].replace("%", ""), 10);

    return Response.json({
      ok: true,
      filesystem: fs,
      total_kb,
      used_kb,
      avail_kb,
      used_percent: used_pct,
    });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
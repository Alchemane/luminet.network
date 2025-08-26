"use client";
import { useEffect, useRef, useState } from "react";

type Log = { t: string; kind?: "ok" | "err" | "sys" };

export default function ConsolePage() {
  const [logs, setLogs] = useState<Log[]>([
    { t: "Luminet v0.1 – console online.", kind: "sys" },
    { t: "No active session. Type `login` to enter Lumen Cipher.", kind: "err" },
  ]);
  const [input, setInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [awaitingCipher, setAwaitingCipher] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const print = (t: string, kind?: Log["kind"]) => setLogs((x) => [...x, { t, kind }]);

  const helpLocked = "Commands: login, help, clear, about";
  const helpOpen =
  "Commands: status [-v|all|sys], services, open cloud, open status, logout, help, clear, time, echo <text>";

  function tokenize(input: string): string[] {
    // supports quotes: echo "hello world"
    const out: string[] = [];
    let cur = "", quote: '"' | "'" | null = null;
    for (const ch of input.trim()) {
      if (quote) {
        if (ch === quote) { quote = null; continue; }
        cur += ch;
      } else {
        if (ch === '"' || ch === "'") { quote = ch as '"' | "'"; continue; }
        if (/\s/.test(ch)) { if (cur) { out.push(cur); cur = ""; } }
        else { cur += ch; }
      }
    }
    if (cur) out.push(cur);
    return out;
  }

  function hasFlag(args: string[], ...flags: string[]) {
    return args.some(a => flags.includes(a));
  }

  async function handle(cmd: string) {
    const line = cmd.trim();
    if (!line) return;

    // echo
    print(`> ${line}`);

    // awaiting cipher?
    if (awaitingCipher && !authed) {
      setAwaitingCipher(false);
      const res = await fetch("/api/auth/cipher", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cipher: line }),
      });
      if (res.ok) {
        setAuthed(true);
        print("Cipher accepted. Session unlocked.", "ok");
        print(helpOpen);
      } else if (res.status === 429) {
        print("Too many attempts. Wait a minute.", "err");
      } else {
        print("Access denied.", "err");
        print("Type `login` to try again.");
      }
      return;
    }

    if (!authed) {
      if (line === "help") return print(helpLocked);
      if (line === "about") return print("Console gateway to the Lumina Box.");
      if (line === "clear") return setLogs([]);
      if (line === "login") {
        print("Enter cipher:", "sys");
        setAwaitingCipher(true);
        return;
      }
      return print("Unauthorized. Type `login`.", "err");
    }

    // ---- UNLOCKED ----
    if (line === "help") return print(helpOpen);
    if (line === "clear") return setLogs([]);
    if (line === "time") return print(new Date().toLocaleString(), "sys");
    if (line.startsWith("echo ")) return print(line.slice(5));
    if (line === "logout") {
      await fetch("/api/auth/logout", { method: "POST" });
      setAuthed(false);
      setAwaitingCipher(false);
      print("Session closed. Type `login`.", "sys");
      return;
    }
    if (line === "status") {
      // helper: client-side timeout so it never hangs
      const fetchTO = (url: string, ms = 5000) => {
        const ctl = new AbortController();
        const id = setTimeout(() => ctl.abort(), ms);
        return fetch(url, { cache: "no-store", signal: ctl.signal })
          .finally(() => clearTimeout(id));
      };

      try {
        // hit sys + services in parallel
        const [sysP, svcP] = await Promise.allSettled([
          fetchTO("/api/sys", 5000),
          fetchTO("/api/status", 5000),
        ]);

        const sys = sysP.status === "fulfilled" && sysP.value.ok ? await sysP.value.json() : null;
        const svc = svcP.status === "fulfilled" && svcP.value.ok ? await svcP.value.json() : null;

        if (!sys && !svc) return print("Status error.", "err");

        // hint when heartbeat is disabled but monitors exist
        if (svc && svc.totals?.all > 0 && svc.totals.up === 0 && svc.totals.down === 0) {
          print("Note: heartbeat unavailable — listing monitors only. Try `open status` for live view.", "sys");
        }

        // compose one-liner
        const uptime = sys ? sys.uptime : "?";
        const cpu = sys ? `${sys.cpu.pct}%` : "?";
        const mem = sys ? `${sys.mem.usedGB}/${sys.mem.totalGB} GB (${sys.mem.pct}%)` : "?";
        const disk = sys ? `${sys.disk.pct}%` : "?";
        const net = sys ? `↑ ${sys.net.txDelta} ↓ ${sys.net.rxDelta}` : "?";
        const services = svc ? `UP ${svc.totals.up} DOWN ${svc.totals.down} (total ${svc.totals.all})` : "?";

        const overallKind: Log["kind"] = svc && svc.totals?.down > 0 ? "err" : "ok";
        return print(
          `Status • Uptime ${uptime} | CPU ${cpu} | RAM ${mem} | Disk ${disk} | Net ${net} | Services ${services}`,
          overallKind as "ok" | "err"
        );
      } catch {
        return print("Status error.", "err");
      }
    }
    if (line === "status -v" || line === "status all") {
      try {
        const r = await fetch("/api/status", { cache: "no-store" });
        if (!r.ok) return print("Status error.", "err");
        const s = await r.json();
        if (!s.ok) return print("Status error.", "err");

        print(`Status • ${s.name} UP ${s.totals.up} DOWN ${s.totals.down} MAINT ${s.totals.maint} (total ${s.totals.all})`,
          s.totals.down > 0 ? "err" : "ok");

        if (s.note) print(s.note, "sys");

        // list monitors (no heartbeat → no live fields)
        for (const m of s.monitors) {
          print(`• ${m.name} | ping - | uptime - | last -`, "sys");
        }
        return;
      } catch {
        return print("Status error.", "err");
      }
    }
    if (line === "status sys") {
      try {
        const r = await fetch("/api/sys", { cache: "no-store" });
        if (!r.ok) return print("sys error.", "err");
        const s = await r.json();
        print(
          `Uptime ${s.uptime} | CPU ${s.cpu.pct}% | RAM ${s.mem.usedGB}/${s.mem.totalGB} GB (${s.mem.pct}%) | Disk ${s.disk.pct}%`,
          "sys"
        );
        return print(
          `Net[${s.net.iface}] ↑ ${s.net.txDelta} ↓ ${s.net.rxDelta} (window ${s.net.windowSec}s) — totals ↑ ${s.net.txTotal} ↓ ${s.net.rxTotal}`,
          "sys"
        );
      } catch {
        return print("sys error.", "err");
      }
    }
    if (line === "services") return print("cloud, status (Kuma), git (future)", "sys");
    if (line === "open cloud") { location.href = "https://cloud.luminet.network"; return; }
    if (line === "open status") { location.href = "https://status.luminet.network"; return; }

    return print("Unknown command. Type `help`.", "err");
  }

  useEffect(() => { box.current?.scrollTo(0, box.current.scrollHeight); }, [logs]);

  return (
    <main className="min-h-dvh bg-black text-zinc-100 grid place-items-center">
      <div className="w-full max-w-3xl border border-zinc-800 bg-zinc-950/70 rounded-2xl p-4">
        <div ref={box} className="h-[60vh] overflow-y-auto font-mono text-sm space-y-1">
          {logs.map((l, i) => (
            <div key={i} className={
              l.kind === "err" ? "text-red-400" :
              l.kind === "ok"  ? "text-emerald-400" :
              l.kind === "sys" ? "text-zinc-400" : ""
            }>
              {l.t}
            </div>
          ))}
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); handle(input); setInput(""); }}
          className="mt-3 flex gap-2"
        >
          <span className="font-mono text-zinc-500">λ</span>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 outline-none"
            placeholder={awaitingCipher ? "Paste cipher…" : "Type a command…"}
          />
          <button className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded">Run</button>
        </form>
      </div>
    </main>
  );
}
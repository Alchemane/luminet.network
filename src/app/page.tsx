"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/* ==============================
   types / helpers
============================== */
export type Log = {
  t: string;
  kind?: "ok" | "err" | "sys";
  animate?: boolean; // new: per-line animation toggle
};
type Flags = Record<string, string | boolean>;
type CmdHandler = (args: string[], flags: Flags) => Promise<void>;

const fmt = {
  ok: (t: string, animate = true): Log => ({ t, kind: "ok", animate }),
  err: (t: string, animate = true): Log => ({ t, kind: "err", animate }),
  sys: (t: string, animate = true): Log => ({ t, kind: "sys", animate }),
};

function parse(input: string): { cmd: string; args: string[]; flags: Flags } {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const cmd = (parts.shift() || "").toLowerCase();
  const flags: Flags = {};
  const args: string[] = [];
  for (const p of parts) {
    if (p.startsWith("--")) {
      const [k, v] = p.slice(2).split("=");
      flags[k] = v ?? true;
    } else if (p.startsWith("-")) {
      for (const ch of p.slice(1)) flags[ch] = true;
    } else {
      args.push(p);
    }
  }
  if (flags.l || flags.long) flags.long = true;
  if (flags.j || flags.json) flags.json = true;
  return { cmd, args, flags };
}

async function getJSON<T = unknown>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? (await res.json()) : (await res.text())) as T;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/* ==============================
   typewriter line component
============================== */
function TypeLine({
  text,
  speed = 14,
  className,
  onProgress,
  animate = true,
}: {
  text: string;
  speed?: number;
  className?: string;
  onProgress?: () => void;
  animate?: boolean;
}) {
  const [shown, setShown] = useState<string>(animate ? "" : text);
  const idxRef = useRef(0);

  useEffect(() => {
    // skip animation for very long outputs to avoid jank
    const shouldAnimate = animate && text.length <= 2000;
    if (!shouldAnimate) {
      setShown(text);
      onProgress?.();
      return;
    }

    setShown("");
    idxRef.current = 0;
    const timer = setInterval(() => {
      idxRef.current++;
      setShown(text.slice(0, idxRef.current));
      onProgress?.();
      if (idxRef.current >= text.length) clearInterval(timer);
    }, speed);

    return () => clearInterval(timer);
  }, [text, speed, animate, onProgress]);

  // split into hard-wrapped lines but keep monospace spacing
  return (
    <div className={`font-mono whitespace-pre-wrap leading-6 ${className || ""}`}>{shown}</div>
  );
}

/* ==============================
   page component
============================== */
export default function ConsolePage() {
  const [logs, setLogs] = useState<Log[]>([
    fmt.sys("Luminet Console connected to Lumina Box."),
    fmt.err("No active session. Type 'login' (or 'key') to enter cipher."),
  ]);
  const [input, setInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [awaitingCipher, setAwaitingCipher] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);

  // smooth auto scroll also called during typing via onProgress
  const scrollToBottom = () => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };
  useEffect(() => {
    scrollToBottom();
  }, [logs.length]);

  const print = (t: string, kind?: Log["kind"], animate = true) =>
    setLogs((x) => [...x, { t, kind, animate }]);

  /* ---------- command handlers ---------- */
  const handlers: Record<string, CmdHandler> = useMemo(() => {
    const h: Record<string, CmdHandler> = {};

    h.help = async () => {
      print(
        [
          "Commands:",
          "  status [--long|--json]      • overview: uptime, cpu, mem, disk, net, services",
          "  sys [--json]                • host snapshot (uptime, load, cpu, mem, disk, temp)",
          "  net [--iface <name>]        • IPs, gateway, DNS, rx/tx rates",
          "  services [--json]           • service health summary",
          "  ps [--top N|--filter q]     • top processes",
          "  ports [--listening]         • listening/established ports",
          "  disk [--mounts|--path p]    • disk usage, mounts, biggest dirs (with --path)",
          "  ping <host> [--count N]     • ICMP/HTTP ping summary",
          "  dns <name> [--type T]       • resolve using server’s resolvers",
          "  http <url> [--head]         • status-only head/get from server",
          "  whoami                      • session info",
          "  login / key                 • enter cipher → session cookie",
          "  logout                      • clear session",
          "  open <status|git>           • quick links",
          "  time                        • server time",
          "  echo <text>, clear, about   • utility",
        ].join("\n"),
        "sys"
      );
    };

    h.clear = async () => setLogs([]);

    h.about = async () => {
      print("Luminet • unified console • status + deep dives • auth via cipher → JWT", "sys");
    };

    h.echo = async (args) => print(args.join(" "));

    h.time = async () => {
      try {
        const data = await getJSON<{ now: string; tz?: string }>("/api/time");
        print(`Server time: ${data.now}${data.tz ? ` (${data.tz})` : ""}`, "sys");
      } catch (e) {
        print(`time: ${errMsg(e)}`, "err");
      }
    };

    h.login = async () => {
      if (authed) return print("Already authenticated.", "ok");
      setAwaitingCipher(true);
      print("Enter Lumen cipher:");
    };

    h.key = h.login;

    h.logout = async () => {
      try {
        await fetch("/api/auth/logout", { method: "POST" });
      } catch {
        /* noop */
      }
      setAuthed(false);
      print("Session cleared.", "ok");
    };

    h.whoami = async () => {
      try {
        const s = await getJSON<{ authenticated: boolean; exp?: string; ip?: string }>("/api/session");
        print(
          `Auth: ${s.authenticated ? "yes" : "no"}${s.exp ? ` • exp ${s.exp}` : ""}${s.ip ? ` • ip ${s.ip}` : ""}`,
          "sys"
        );
      } catch (e) {
        print(`whoami: ${errMsg(e)}`, "err");
      }
    };

    h.status = async (_args, flags) => {
      const mode = flags.json ? "json" : flags.long ? "long" : "short";
      try {
        const res = await fetch(`/api/status?mode=${mode}`);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const ct = res.headers.get("content-type") || "";
        if (ct.includes("application/json")) {
          const data = await res.json();
          // huge JSON: print without animation
          print(JSON.stringify(data, null, 2), "sys", false);
        } else {
          print(await res.text(), "sys");
        }
      } catch (e) {
        print(`status: ${errMsg(e)}`, "err");
      }
    };

    h.sys = async (_args, flags) => {
      try {
        const data = await getJSON(`/api/sys${flags.json ? "?format=json" : ""}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`sys: ${errMsg(e)}`, "err");
      }
    };

    h.net = async (_args, flags) => {
      const q = new URLSearchParams();
      if (flags.iface && typeof flags.iface === "string") q.set("iface", String(flags.iface));
      if (flags.json) q.set("format", "json");
      try {
        const data = await getJSON(`/api/net${q.size ? "?" + q.toString() : ""}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`net: ${errMsg(e)}`, "err");
      }
    };

    h.services = async (_args, flags) => {
      try {
        const data = await getJSON(`/api/services${flags.json ? "?format=json" : ""}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`services: ${errMsg(e)}`, "err");
      }
    };

    h.ps = async (_args, flags) => {
      const q = new URLSearchParams();
      if (flags.top) q.set("top", String(flags.top));
      if (flags.filter && typeof flags.filter === "string") q.set("filter", String(flags.filter));
      if (flags.json) q.set("format", "json");
      try {
        const data = await getJSON(`/api/ps${q.size ? "?" + q.toString() : ""}`);
        typeof data === "string"
          ? print(String(data))
          : print(JSON.stringify(data, null, 2), undefined, false);
      } catch (e) {
        print(`ps: ${errMsg(e)}`, "err");
      }
    };

    h.ports = async (_args, flags) => {
      const q = new URLSearchParams();
      if (flags.listening) q.set("listening", "1");
      if (flags.established) q.set("established", "1");
      if (flags.json) q.set("format", "json");
      try {
        const data = await getJSON(`/api/ports${q.size ? "?" + q.toString() : ""}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`ports: ${errMsg(e)}`, "err");
      }
    };

    h.ping = async (args, _flags) => {
      if (!args[0]) return print("Usage: ping <host> [--count N]", "err");
      const q = new URLSearchParams({ host: args[0] });
      if (_flags.count) q.set("count", String(_flags.count));
      try {
        const data = await getJSON(`/api/ping?${q.toString()}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`ping: ${errMsg(e)}`, "err");
      }
    };

    h.dns = async (args, flags) => {
      if (!args[0]) return print("Usage: dns <name> [--type A|AAAA|TXT]", "err");
      const q = new URLSearchParams({ name: args[0] });
      if (flags.type && typeof flags.type === "string") q.set("type", String(flags.type));
      try {
        const data = await getJSON(`/api/dns?${q.toString()}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`dns: ${errMsg(e)}`, "err");
      }
    };

    h.http = async (args, flags) => {
      if (!args[0]) return print("Usage: http <url> [--head]", "err");
      const q = new URLSearchParams({ url: args[0] });
      if (flags.head) q.set("head", "1");
      try {
        const data = await getJSON(`/api/http?${q.toString()}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`http: ${errMsg(e)}`, "err");
      }
    };

    h.disk = async (_args, flags) => {
      const q = new URLSearchParams();
      if (flags.mounts) q.set("mounts", "1");
      if (flags.path && typeof flags.path === "string") q.set("path", String(flags.path));
      if (flags.json) q.set("format", "json");
      try {
        const data = await getJSON(`/api/disk${q.size ? "?" + q.toString() : ""}`);
        typeof data === "string"
          ? print(data, "sys")
          : print(JSON.stringify(data, null, 2), "sys", false);
      } catch (e) {
        print(`disk: ${errMsg(e)}`, "err");
      }
    };

    h.open = async (args) => {
      const target = (args[0] || "").toLowerCase();
      const map: Record<string, string> = {
        status: "https://status.luminet.network/",
      };
      const url = map[target];
      if (!url) return print("open: unknown target. Try: status", "err");
      window.open(url, "_blank", "noreferrer");
      print(`Opened ${target}.`, "ok");
    };

    return h;
  }, [authed]);

  /* ---------- input / submit ---------- */
  async function run(e?: React.FormEvent) {
    e?.preventDefault();
    const raw = input.trim();
    if (!raw) return;
    setInput("");

    // show the typed command immediately (animated fast)
    print(`λ ${raw}`, "sys");

    // cipher capture flow
    if (awaitingCipher && !authed) {
      setAwaitingCipher(false);
      try {
        const res = await fetch("/api/auth/unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cipher: raw }),
        });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        setAuthed(true);
        print("Cipher accepted. Session unlocked.", "ok");
        await handlers.whoami([], {});
      } catch (e) {
        print(`Auth failed: ${errMsg(e)}`, "err");
      }
      return;
    }

    const { cmd, args, flags } = parse(raw);
    const alias: Record<string, string> = { health: "status", key: "login", ip: "net", uptime: "sys" };
    const verb = alias[cmd] || cmd;

    const handler = handlers[verb];
    if (!handler) return print(`Unknown command: ${cmd}. Try 'help'.`, "err");

    const protectedSet = new Set([
      "status",
      "sys",
      "net",
      "services",
      "ps",
      "ports",
      "disk",
      "ping",
      "dns",
      "http",
      "whoami",
    ]);
    if (protectedSet.has(verb) && !authed) {
      print("This command requires login. Type 'login' to authenticate.", "err");
      return;
    }

    try {
      await handler(args, flags);
    } catch (e) {
      print(errMsg(e), "err");
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight mb-4">Luminet Console</h1>

        <div
          ref={boxRef}
          className="h-[60vh] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-1"
        >
          {logs.map((l, i) => {
            const color =
              l.kind === "err"
                ? "text-red-400"
                : l.kind === "ok"
                ? "text-emerald-400"
                : l.kind === "sys"
                ? "text-zinc-300"
                : "";
            // split on newline to animate each physical line independently
            const lines = l.t.split("\n");
            return (
              <div key={i} className={color}>
                {lines.map((line, idx) => (
                  <TypeLine
                    key={idx}
                    text={line}
                    animate={l.animate !== false}
                    onProgress={scrollToBottom}
                  />
                ))}
              </div>
            );
          })}
        </div>

        <form onSubmit={run} className="mt-4 flex items-center gap-2">
          <span className="font-mono text-zinc-500">λ</span>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setLogs([]);
              }
            }}
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 outline-none font-mono"
            placeholder={awaitingCipher ? "Lumen cipher:" : "Type a command… (try 'help')"}
          />
          <button type="submit" className="px-3 py-2 bg-zinc-800 hover:bg-zinc-700 rounded">
            Run
          </button>
        </form>

        <div className="mt-2 text-xs text-zinc-500 font-mono">
          Tips: <kbd className="px-1 py-0.5 border border-zinc-700 rounded">Ctrl</kbd>+
          <kbd className="px-1 py-0.5 border border-zinc-700 rounded">L</kbd> to clear · Use{" "}
          <code>--long</code> or <code>--json</code> for detail
        </div>
      </div>
    </main>
  );
}
"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Log } from "@/components/console/Output";

/* ---------- types & helpers ---------- */
export type Flags = Record<string, string | boolean>;
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

/* ---------- main hook ---------- */
export function useConsole() {
  const [logs, setLogs] = useState<Log[]>([
    fmt.sys("Luminet Console connected to Lumina Box."),
    fmt.err("No active session. Type 'login' (or 'key') to enter cipher."),
  ]);
  const [input, setInput] = useState("");
  const [authed, setAuthed] = useState(false);
  const [awaitingCipher, setAwaitingCipher] = useState(false);

  // scrolling
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollToBottom = useCallback(() => {
    const el = boxRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);
  useEffect(() => {
    scrollToBottom();
  }, [logs.length, scrollToBottom]);

  const print = useCallback(
    (t: string, kind?: Log["kind"], animate = true) =>
      setLogs((x) => [...x, { t, kind, animate }]),
    []
  );

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
      } catch {/* noop */}
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

    h.ping = async (args, flags) => {
      if (!args[0]) return print("Usage: ping <host> [--count N]", "err");
      const q = new URLSearchParams({ host: args[0] });
      if (flags.count) q.set("count", String(flags.count));
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
  }, [authed, print]);

  const run = useCallback(
    async (e?: React.FormEvent) => {
      e?.preventDefault();
      const raw = input.trim();
      if (!raw) return;
      setInput("");
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

      const protectedSet = new Set([
        "status", "sys", "net", "services", "ps",
        "ports", "disk", "ping", "dns", "http", "whoami",
      ]);
      if (protectedSet.has(verb) && !authed) {
        print("This command requires login. Type 'login' to authenticate.", "err");
        return;
      }

      if (!handler) {
        print(`Unknown command: ${cmd}. Try 'help'.`, "err");
        return;
      }

      try {
        await handler(args, flags);
      } catch (e) {
        print(errMsg(e), "err");
      }
    },
    [input, print, handlers, authed, awaitingCipher]
  );

  return {
    state: { logs, input, authed, awaitingCipher },
    actions: { setInput, run, print, setAwaitingCipher },
    refs: { boxRef, scrollToBottom },
  };
}

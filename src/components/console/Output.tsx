"use client";
import TypeLine from "./TypeLine";

export type Log = {
  t: string;
  kind?: "ok" | "err" | "sys";
  animate?: boolean;
};

export default function Output({
  logs,
  onProgress,
  containerRef,
}: {
  logs: Log[];
  onProgress: () => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={containerRef}
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
        const lines = l.t.split("\n");
        return (
          <div key={i} className={color}>
            {lines.map((line, idx) => (
              <TypeLine
                key={idx}
                text={line}
                animate={l.animate !== false}
                onProgress={onProgress}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

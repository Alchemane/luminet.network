"use client";
import Output from "./Output";
import { useConsole } from "@/hooks/useConsole";

export default function Console() {
  const {
    state: { logs, input, awaitingCipher },
    actions: { setInput, run },
    refs: { boxRef, scrollToBottom },
  } = useConsole();

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <h1 className="text-xl font-semibold tracking-tight mb-4">Luminet Console</h1>

        <Output logs={logs} onProgress={scrollToBottom} containerRef={boxRef} />

        <form onSubmit={run} className="mt-4 flex items-center gap-2">
          <span className="font-mono text-zinc-500">λ</span>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                setInput("clear");
                requestAnimationFrame(() => (document.activeElement as HTMLInputElement)?.form?.requestSubmit());
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
          Tips: <kbd className="px-1 py-0.5 border border-zinc-700 rounded">Ctrl</kbd>
          +
          <kbd className="px-1 py-0.5 border border-zinc-700 rounded">L</kbd> to clear · Use{" "}
          <code>--long</code> or <code>--json</code> for detail
        </div>
      </div>
    </main>
  );
}

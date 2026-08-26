"use client";

import { formatRelativeTime } from "@/lib/periods";
import type { StatsPayload } from "@/lib/stats";

export default function MemoryLedger({
  stats,
  now,
}: {
  stats: StatsPayload;
  now: number;
}) {
  const top = stats.countries.slice(0, 8);
  const max = top.reduce((acc, row) => Math.max(acc, row.count), 1);
  const reference = new Date(now);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="card p-6">
        <header className="flex items-baseline justify-between">
          <h3 className="font-display text-xl text-ink">Where she is remembered</h3>
          <span className="text-[10px] uppercase tracking-[0.28em] text-mist/60">all time</span>
        </header>
        <div className="gold-rule my-4" />
        {top.length === 0 ? (
          <p className="py-8 text-center text-sm text-mist">
            No one has remembered her yet. Be the first light on the map.
          </p>
        ) : (
          <ol className="space-y-3.5">
            {top.map((row, index) => (
              <li key={row.code} className="group">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-4 shrink-0 text-[10px] text-mist/50 mono">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-ink/90">
                      {row.emoji ? `${row.emoji} ` : ""}
                      {row.name}
                    </span>
                    {row.today > 0 ? (
                      <span className="shrink-0 rounded-full border border-tide/30 px-2 py-0.5 text-[9px] uppercase tracking-[0.2em] text-tide">
                        +{row.today} today
                      </span>
                    ) : null}
                  </span>
                  <span className="shrink-0 text-gold mono">{row.count.toLocaleString()}</span>
                </div>
                <div className="mt-2 h-px w-full overflow-hidden bg-white/5">
                  <div
                    className="tally-bar"
                    style={{ width: `${Math.max(3, (row.count / max) * 100)}%` }}
                  />
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card p-6">
        <header className="flex items-baseline justify-between">
          <h3 className="font-display text-xl text-ink">Just now</h3>
          <span className="flex items-center gap-2 text-[10px] uppercase tracking-[0.28em] text-mist/60">
            <span className="pulse-dot" /> live
          </span>
        </header>
        <div className="gold-rule my-4" />
        {stats.recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-mist">
            Silence. She is waiting for someone to look back.
          </p>
        ) : (
          <ul className="max-h-[22rem] space-y-1 overflow-hidden">
            {stats.recent.map((row, index) => (
              <li
                key={row.id}
                className="ticker-row flex items-center justify-between gap-3 border-b border-white/5 py-2.5 text-sm last:border-0"
                style={{ animationDelay: `${Math.min(index, 10) * 60}ms` }}
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="text-base leading-none">{row.emoji || "🌍"}</span>
                  <span className="truncate text-ink/85">{row.name}</span>
                </span>
                <span className="shrink-0 text-[11px] tracking-wide text-mist/70 mono">
                  {formatRelativeTime(new Date(row.at), reference)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

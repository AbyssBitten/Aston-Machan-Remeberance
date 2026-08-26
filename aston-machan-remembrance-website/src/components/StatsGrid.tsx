"use client";

import { formatCountdown } from "@/lib/periods";
import type { StatsPayload } from "@/lib/stats";
import { useAnimatedNumber } from "@/components/useAnimatedNumber";

type CardProps = {
  label: string;
  value: number;
  caption: string;
  resetAt?: string;
  now: number;
  accent: "gold" | "tide" | "ember";
  index: number;
  highlight?: boolean;
};

const ACCENTS = {
  gold: { text: "text-gold", ring: "rgba(244,205,134,0.35)", glow: "rgba(244,205,134,0.16)" },
  tide: { text: "text-tide", ring: "rgba(127,215,208,0.32)", glow: "rgba(127,215,208,0.14)" },
  ember: { text: "text-ember", ring: "rgba(217,139,95,0.32)", glow: "rgba(217,139,95,0.14)" },
} as const;

function StatCard({
  label,
  value,
  caption,
  resetAt,
  now,
  accent,
  index,
  highlight,
}: CardProps) {
  const shown = useAnimatedNumber(value);
  const remaining = resetAt ? formatCountdown(new Date(resetAt).getTime() - now) : "";
  const tone = ACCENTS[accent];

  return (
    <div
      className="card animate-fade-up overflow-hidden p-5"
      style={{
        animationDelay: `${index * 110}ms`,
        borderColor: highlight ? tone.ring : undefined,
        boxShadow: highlight ? `0 0 0 1px ${tone.ring}, 0 30px 70px -40px ${tone.glow}` : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute -top-16 -right-10 h-32 w-32 rounded-full blur-3xl"
        style={{ background: tone.glow }}
      />
      <div className="text-[10px] uppercase tracking-[0.34em] text-mist/80">{label}</div>
      <div className={`mono mt-3 font-display text-5xl leading-none ${tone.text}`}>
        {shown.toLocaleString()}
      </div>
      <div className="mt-3 text-xs leading-relaxed text-mist">{caption}</div>
      {resetAt ? (
        <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.24em] text-mist/60">
          <span>resets in</span>
          <span className={`mono ${tone.text}`}>{remaining}</span>
        </div>
      ) : (
        <div className="mt-4 border-t border-white/5 pt-3 text-[10px] uppercase tracking-[0.24em] text-mist/60">
          since the first rememberer
        </div>
      )}
      <span className="sr-only">
        {value.toLocaleString()} people remembered Machan {caption}
      </span>
    </div>
  );
}

export default function StatsGrid({ stats, now }: { stats: StatsPayload; now: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <StatCard
        index={0}
        accent="gold"
        label="Today"
        value={stats.today}
        caption="people remembered Machan today"
        resetAt={stats.resets.day}
        now={now}
        highlight
      />
      <StatCard
        index={1}
        accent="tide"
        label="This week"
        value={stats.week}
        caption="since Monday 00:00 UTC"
        resetAt={stats.resets.week}
        now={now}
      />
      <StatCard
        index={2}
        accent="ember"
        label="This month"
        value={stats.month}
        caption="since the 1st, 00:00 UTC"
        resetAt={stats.resets.month}
        now={now}
      />
      <StatCard
        index={3}
        accent="gold"
        label="All time"
        value={stats.total}
        caption="she has been remembered"
        now={now}
      />
    </div>
  );
}

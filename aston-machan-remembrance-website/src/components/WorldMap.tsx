"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import worldMap from "@/data/world-map.json";
import type { DescribedCountry } from "@/lib/countries";
import type { StatsPayload } from "@/lib/stats";

type Geometry = {
  code: string;
  name: string;
  region: string;
  d: string;
  cx: number;
  cy: number;
};

const GEOMETRY = worldMap.countries as Geometry[];
const GEOMETRY_BY_CODE = new Map(GEOMETRY.map((c) => [c.code, c]));

type Hover = {
  name: string;
  emoji: string;
  count: number;
  today: number;
  x: number;
  y: number;
  isYou: boolean;
};

function glow(count: number, max: number) {
  if (count <= 0) return null;
  const t = Math.pow(count / Math.max(1, max), 0.5);
  return {
    fill: `rgba(244, ${Math.round(198 + 34 * t)}, ${Math.round(120 + 40 * t)}, ${(
      0.2 + 0.68 * t
    ).toFixed(3)})`,
    level: t,
  };
}

export default function WorldMap({
  stats,
  yourCountry,
  awake,
}: {
  stats: StatsPayload;
  yourCountry: DescribedCountry | null;
  awake: boolean;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const frame = useRef<number | null>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const tally = useMemo(() => {
    const map = new Map<string, { count: number; today: number; emoji: string }>();
    for (const row of stats.countries) {
      map.set(row.code, { count: row.count, today: row.today, emoji: row.emoji });
    }
    return map;
  }, [stats.countries]);

  const maxCount = useMemo(
    () => stats.countries.reduce((max, row) => Math.max(max, row.count), 1),
    [stats.countries],
  );

  const you = yourCountry ? GEOMETRY_BY_CODE.get(yourCountry.code) ?? null : null;

  const pings = useMemo(() => {
    const seen = new Set<string>();
    const out: { code: string; cx: number; cy: number; delay: number }[] = [];
    for (const entry of stats.recent) {
      if (seen.has(entry.code)) continue;
      const geo = GEOMETRY_BY_CODE.get(entry.code);
      if (!geo) continue;
      seen.add(entry.code);
      out.push({ code: entry.code, cx: geo.cx, cy: geo.cy, delay: out.length * 0.55 });
      if (out.length >= 6) break;
    }
    return out;
  }, [stats.recent]);

  /* Parallax applied imperatively so 177 paths never re-render on mouse move. */
  const onMove = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const shell = shellRef.current;
    const layer = layerRef.current;
    if (!shell || !layer) return;
    const rect = shell.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width - 0.5;
    const py = (event.clientY - rect.top) / rect.height - 0.5;
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      layer.style.transform = `translate3d(${(px * -10).toFixed(2)}px, ${(py * -7).toFixed(
        2,
      )}px, 0) scale(1.035)`;
    });
  }, []);

  const resetLayer = useCallback(() => {
    const layer = layerRef.current;
    if (layer) layer.style.transform = "translate3d(0,0,0) scale(1.035)";
  }, []);

  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return (
    <div
      ref={shellRef}
      onMouseMove={onMove}
      onMouseLeave={() => {
        resetLayer();
        setHover(null);
      }}
      className="map-shell"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 12%, rgba(90,120,190,0.16), transparent 70%)",
        }}
      />

      <div ref={layerRef} className="relative transition-transform duration-700 ease-out">
        <svg
          className="map-svg"
          viewBox={`0 0 ${worldMap.width} ${worldMap.height}`}
          role="img"
          aria-label="World map showing how many people have remembered Aston Machan from each country"
        >
          <defs>
            <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0a1024" />
              <stop offset="52%" stopColor="#070b18" />
              <stop offset="100%" stopColor="#04060e" />
            </linearGradient>
            <linearGradient id="youGlow" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#fff3d6" />
              <stop offset="100%" stopColor="#f4cd86" />
            </linearGradient>
            <filter id="soft" x="-60%" y="-60%" width="220%" height="220%">
              <feGaussianBlur stdDeviation="6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect x="0" y="0" width={worldMap.width} height={worldMap.height} fill="url(#ocean)" />

          <path
            d={worldMap.sphere}
            fill="none"
            stroke="rgba(150,175,225,0.13)"
            strokeWidth="0.8"
          />
          <path
            d={worldMap.graticule}
            fill="none"
            stroke="rgba(140,165,215,0.075)"
            strokeWidth="0.5"
          />

          <g>
            {GEOMETRY.map((country) => {
              const entry = tally.get(country.code);
              const tone = glow(entry?.count ?? 0, maxCount);
              const isYou = yourCountry?.code === country.code;
              const alive = (entry?.today ?? 0) > 0;
              const className = [
                "country",
                tone ? "country-lit" : "country-dim",
                isYou ? "country-active" : "",
                alive && awake ? "breathe" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <path
                  key={country.code}
                  d={country.d}
                  className={className}
                  fill={tone?.fill ?? undefined}
                  strokeWidth={isYou ? 0.9 : 0.5}
                  style={{ opacity: tone ? 1 : 0.95 }}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
                    if (!rect) return;
                    setHover({
                      name: entry?.emoji ? `${entry.emoji} ${country.name}` : country.name,
                      emoji: entry?.emoji ?? "",
                      count: entry?.count ?? 0,
                      today: entry?.today ?? 0,
                      x: ((country.cx / worldMap.width) * rect.width),
                      y: ((country.cy / worldMap.height) * rect.height),
                      isYou,
                    });
                  }}
                />
              );
            })}
          </g>

          <g pointerEvents="none">
            {pings.map((ping) => (
              <g key={`ping-${ping.code}`}>
                <circle
                  className="ping"
                  cx={ping.cx}
                  cy={ping.cy}
                  r={2}
                  fill="none"
                  stroke="rgba(244,205,134,0.85)"
                  style={{ animationDelay: `${ping.delay}s` }}
                />
                <circle cx={ping.cx} cy={ping.cy} r={1.5} fill="rgba(255,232,180,0.9)" />
              </g>
            ))}
          </g>

          {you ? (
            <g pointerEvents="none">
              <circle cx={you.cx} cy={you.cy} r={11} fill="rgba(255,226,160,0.1)" />
              <circle
                className="ping"
                cx={you.cx}
                cy={you.cy}
                r={3}
                fill="none"
                stroke="rgba(255,236,195,0.95)"
              />
              <circle
                className="marker-dot"
                cx={you.cx}
                cy={you.cy}
                r={3.4}
                fill="url(#youGlow)"
                filter="url(#soft)"
              />
              <line
                className="map-label"
                x1={you.cx}
                y1={you.cy}
                x2={you.cx + 16}
                y2={you.cy - 14}
                stroke="rgba(255,236,195,0.5)"
                strokeWidth="0.6"
              />
              <text
                className="map-label"
                x={you.cx + 20}
                y={you.cy - 16}
                fill="#ffeecb"
                fontSize="10"
                letterSpacing="2.4"
                style={{ textTransform: "uppercase" }}
              >
                {(yourCountry?.name ?? "").toUpperCase()}
              </text>
            </g>
          ) : null}
        </svg>
      </div>

      {hover ? (
        <div
          className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-[135%] whitespace-nowrap rounded-xl border border-white/10 bg-[#080b16]/95 px-3.5 py-2 text-xs shadow-2xl backdrop-blur"
          style={{ left: hover.x, top: hover.y }}
        >
          <div className="font-medium tracking-wide text-[#f6f4ff]">{hover.name}</div>
          <div className="mt-0.5 text-[11px] text-mist">
            {hover.count > 0 ? (
              <>
                <span className="text-gold mono">{hover.count.toLocaleString()}</span> remembrance
                {hover.count === 1 ? "" : "s"}
                {hover.today > 0 ? (
                  <span className="text-tide"> · {hover.today} today</span>
                ) : null}
              </>
            ) : (
              <span className="text-mist/70">No one has remembered her here yet</span>
            )}
          </div>
          {hover.isYou ? (
            <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-gold">
              you are here
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-none absolute bottom-4 left-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.28em] text-mist/70">
        <span>dim</span>
        <span
          className="h-1.5 w-24 rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(148,163,197,0.2), rgba(244,205,134,0.45), rgba(255,232,170,0.95))",
          }}
        />
        <span>bright</span>
      </div>

      <div className="pointer-events-none absolute right-5 bottom-4 text-right text-[10px] uppercase tracking-[0.28em] text-mist/70">
        <div>
          <span className="text-gold mono">{stats.countries.length}</span> countries remembering
        </div>
        <div className="mt-1">
          <span className="text-gold mono">{stats.total.toLocaleString()}</span> remembrances all
          time
        </div>
      </div>
    </div>
  );
}

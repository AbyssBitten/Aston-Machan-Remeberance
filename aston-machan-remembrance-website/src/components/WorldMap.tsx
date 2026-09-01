"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import worldMap from "@/data/world-map.json";
import { COUNTRY_META, type DescribedCountry } from "@/lib/countries";
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
const BY_CODE = new Map(GEOMETRY.map((c) => [c.code, c]));

const W = worldMap.width;
const H = worldMap.height;
const CX = W / 2;
const CY = H / 2;
const MIN_Z = 1;
const MAX_Z = 8;

type View = { z: number; x: number; y: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Keeps the world from being flung off the edge of its own frame. */
function clampView(view: View): View {
  const z = clamp(view.z, MIN_Z, MAX_Z);
  if (z <= 1.001) return { z, x: 0, y: 0 };
  const maxX = (z - 1) * CX + 40;
  const maxY = (z - 1) * CY + 30;
  return { z, x: clamp(view.x, -maxX, maxX), y: clamp(view.y, -maxY, maxY) };
}

/**
 * The SVG is letterboxed inside its frame (preserveAspectRatio: meet), and it
 * scales uniformly. One shared unit therefore converts screen pixels to map
 * units on BOTH axes — using width for x and height for y would make vertical
 * drags run at the wrong speed on any frame that is not exactly 2:1.
 */
function metrics(rect: DOMRect) {
  const unit = Math.min(rect.width / W, rect.height / H);
  return {
    unit,
    ox: (rect.width - W * unit) / 2,
    oy: (rect.height - H * unit) / 2,
  };
}

function glow(count: number, max: number) {
  if (count <= 0) return null;
  const t = Math.pow(count / Math.max(1, max), 0.5);
  return `rgba(244, ${Math.round(198 + 34 * t)}, ${Math.round(120 + 40 * t)}, ${(
    0.2 + 0.68 * t
  ).toFixed(3)})`;
}

export type WorldMapProps = {
  stats: StatsPayload;
  yourCountry: DescribedCountry | null;
  awake: boolean;
  onSelectCountry?: (countryCode: string) => void;
  busy?: boolean;
};

export default function WorldMap({
  stats,
  yourCountry,
  awake,
  onSelectCountry,
  busy = false,
}: WorldMapProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<View>({ z: 1, x: 0, y: 0 });
  const [smooth, setSmooth] = useState(false);
  const [grabbing, setGrabbing] = useState(false);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [hoverCode, setHoverCode] = useState<string | null>(null);
  const [touchUsed, setTouchUsed] = useState(false);

  const viewRef = useRef(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const dragRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ dist: number; z: number; mx: number; my: number } | null>(null);
  /** Stays true until the NEXT gesture begins, so the click that follows a pan is ignored. */
  const movedRef = useRef(false);
  const tapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  /* ------------------------------------------------------------- tallies */
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

  const you = yourCountry ? BY_CODE.get(yourCountry.code) ?? null : null;

  const pings = useMemo(() => {
    const seen = new Set<string>();
    const out: { code: string; cx: number; cy: number; delay: number }[] = [];
    for (const entry of stats.recent) {
      if (seen.has(entry.code)) continue;
      const geo = BY_CODE.get(entry.code);
      if (!geo) continue;
      seen.add(entry.code);
      out.push({ code: entry.code, cx: geo.cx, cy: geo.cy, delay: out.length * 0.55 });
      if (out.length >= 6) break;
    }
    return out;
  }, [stats.recent]);

  /* --------------------------------------------------------- view driver */
  const applyView = useCallback((next: View, animate = false) => {
    const clamped = clampView(next);
    viewRef.current = clamped;
    setView(clamped);
    if (animate) {
      setSmooth(true);
      window.setTimeout(() => setSmooth(false), 430);
    }
  }, []);

  /** Zoom so the map point under (clientX, clientY) stays under it. */
  const zoomAt = useCallback(
    (nextZoom: number, clientX: number, clientY: number, animate = false) => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const { unit, ox, oy } = metrics(rect);
      const vx = (clientX - rect.left - ox) / unit;
      const vy = (clientY - rect.top - oy) / unit;
      const cur = viewRef.current;
      const mx = (vx - CX - cur.x) / cur.z + CX;
      const my = (vy - CY - cur.y) / cur.z + CY;
      const z = clamp(nextZoom, MIN_Z, MAX_Z);
      applyView({ z, x: vx - CX - (mx - CX) * z, y: vy - CY - (my - CY) * z }, animate);
    },
    [applyView],
  );

  const zoomByButton = useCallback(
    (factor: number) => {
      const shell = shellRef.current;
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      zoomAt(viewRef.current.z * factor, rect.left + rect.width / 2, rect.top + rect.height / 2, true);
    },
    [zoomAt],
  );

  const resetView = useCallback(() => {
    applyView({ z: 1, x: 0, y: 0 }, true);
  }, [applyView]);

  const focusCountry = useCallback(
    (code: string, zoomLevel = 3.4) => {
      const geo = BY_CODE.get(code);
      if (!geo) return;
      applyView(
        { z: zoomLevel, x: (CX - geo.cx) * zoomLevel, y: (CY - geo.cy) * zoomLevel },
        true,
      );
    },
    [applyView],
  );

  /* ------------------------------------------------- touch: pan & pinch */
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const onTouchStart = (event: TouchEvent) => {
      setTouchUsed(true);
      movedRef.current = false;
      setSmooth(false);

      if (event.touches.length === 2) {
        event.preventDefault();
        const [t0, t1] = [event.touches[0], event.touches[1]];
        const rect = shell.getBoundingClientRect();
        const { unit, ox, oy } = metrics(rect);
        const vx = (t0.clientX + t1.clientX) / 2 - rect.left - ox;
        const vy = (t0.clientY + t1.clientY) / 2 - rect.top - oy;
        const cur = viewRef.current;
        pinchRef.current = {
          dist: Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY) || 1,
          z: cur.z,
          mx: (vx / unit - CX - cur.x) / cur.z + CX,
          my: (vy / unit - CY - cur.y) / cur.z + CY,
        };
        dragRef.current = null;
        return;
      }

      const touch = event.touches[0];
      if (!touch) return;
      const cur = viewRef.current;
      if (cur.z > 1.02) event.preventDefault();
      dragRef.current = { x: touch.clientX, y: touch.clientY, panX: cur.x, panY: cur.y };
    };

    const onTouchMove = (event: TouchEvent) => {
      const shell2 = shellRef.current;
      if (!shell2) return;
      const rect = shell2.getBoundingClientRect();
      const { unit, ox, oy } = metrics(rect);

      const pinch = pinchRef.current;
      if (event.touches.length === 2 && pinch) {
        event.preventDefault();
        movedRef.current = true;
        const [t0, t1] = [event.touches[0], event.touches[1]];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const z = clamp((pinch.z * dist) / pinch.dist, MIN_Z, MAX_Z);
        const vx = ((t0.clientX + t1.clientX) / 2 - rect.left - ox) / unit;
        const vy = ((t0.clientY + t1.clientY) / 2 - rect.top - oy) / unit;
        applyView({ z, x: vx - CX - (pinch.mx - CX) * z, y: vy - CY - (pinch.my - CY) * z });
        return;
      }

      const drag = dragRef.current;
      const touch = event.touches[0];
      if (!drag || !touch || event.touches.length !== 1) return;

      const dx = touch.clientX - drag.x;
      const dy = touch.clientY - drag.y;
      if (Math.hypot(dx, dy) > 6) movedRef.current = true;

      // Below 1x the page keeps its normal vertical scroll; zoomed in, we pan.
      if (viewRef.current.z > 1.02) {
        event.preventDefault();
        applyView({
          z: viewRef.current.z,
          x: drag.panX + dx / unit,
          y: drag.panY + dy / unit,
        });
      }
    };

    const onTouchEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinchRef.current = null;
      if (event.touches.length > 0) return;
      dragRef.current = null;

      // double-tap: zoom to the spot, or pull back out to the whole world
      const touch = event.changedTouches[0];
      if (!touch || movedRef.current) return;
      const last = tapRef.current;
      if (
        last &&
        event.timeStamp - last.t < 330 &&
        Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < 34
      ) {
        tapRef.current = null;
        setSelectedCode(null);
        if (viewRef.current.z > 1.6) resetView();
        else zoomAt(2.8, touch.clientX, touch.clientY, true);
      } else {
        tapRef.current = { t: event.timeStamp, x: touch.clientX, y: touch.clientY };
      }
    };

    shell.addEventListener("touchstart", onTouchStart, { passive: false });
    shell.addEventListener("touchmove", onTouchMove, { passive: false });
    shell.addEventListener("touchend", onTouchEnd);
    shell.addEventListener("touchcancel", onTouchEnd);
    return () => {
      shell.removeEventListener("touchstart", onTouchStart);
      shell.removeEventListener("touchmove", onTouchMove);
      shell.removeEventListener("touchend", onTouchEnd);
      shell.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [applyView, resetView, zoomAt]);

  /* ------------------------------------------------------- wheel (native) */
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    // React attaches wheel passively, so preventDefault only works from here.
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      const pinchGesture = event.ctrlKey || event.metaKey;
      // Leave ordinary page scrolling alone until the visitor is exploring.
      if (!pinchGesture && viewRef.current.z <= 1.02) return;
      event.preventDefault();
      zoomAt(viewRef.current.z * Math.exp(-event.deltaY * 0.0016), event.clientX, event.clientY);
    };

    shell.addEventListener("wheel", onWheel, { passive: false });
    return () => shell.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* --------------------------------------------------------- mouse drag */
  const onMouseDown = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    movedRef.current = false;
    setSmooth(false);
    setGrabbing(true);
    const cur = viewRef.current;
    dragRef.current = { x: event.clientX, y: event.clientY, panX: cur.x, panY: cur.y };
  }, []);

  const onMouseMove = useCallback(
    (event: ReactMouseEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const shell = shellRef.current;
      if (!drag || !shell) return;
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.hypot(dx, dy) > 5) movedRef.current = true;
      const { unit } = metrics(shell.getBoundingClientRect());
      applyView({ z: viewRef.current.z, x: drag.panX + dx / unit, y: drag.panY + dy / unit });
    },
    [applyView],
  );

  const endMouse = useCallback(() => {
    dragRef.current = null;
    setGrabbing(false);
  }, []);

  /* ------------------------------------------------------------ picking */
  const pickCountry = useCallback((code: string) => {
    if (movedRef.current) return;
    setSelectedCode(code);
  }, []);

  const clearIfBackground = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    if (movedRef.current) return;
    const target = event.target as (Element & { dataset?: DOMStringMap }) | null;
    if (target?.dataset?.country) return;
    setSelectedCode(null);
  }, []);

  /* ------------------------------------------------------------ derived */
  const selected = selectedCode ? BY_CODE.get(selectedCode) ?? null : null;
  const selectedTally = selectedCode ? tally.get(selectedCode) : undefined;
  const selectedMeta = selectedCode ? COUNTRY_META[selectedCode] : undefined;
  const selectedIsYou = Boolean(selectedCode && yourCountry?.code === selectedCode);

  const hovered = hoverCode ? BY_CODE.get(hoverCode) ?? null : null;
  const hoveredTally = hoverCode ? tally.get(hoverCode) : undefined;

  const zoomed = view.z > 1.02;
  const transform = `translate(${(CX + view.x).toFixed(2)} ${(CY + view.y).toFixed(
    2,
  )}) scale(${view.z.toFixed(4)}) translate(${-CX} ${-CY})`;
  const hairline = 1 / Math.sqrt(view.z);

  return (
    <div
      ref={shellRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={endMouse}
      onMouseLeave={() => {
        endMouse();
        setHoverCode(null);
      }}
      onClick={clearIfBackground}
      onDoubleClick={(event) => {
        if (view.z > 1.6) resetView();
        else zoomAt(2.8, event.clientX, event.clientY, true);
      }}
      className="map-shell relative aspect-[5/4] w-full xs:aspect-[3/2] sm:aspect-[16/9] lg:aspect-[2/1]"
      style={{
        cursor: zoomed ? (grabbing ? "grabbing" : "grab") : "default",
        touchAction: zoomed ? "none" : "pan-y",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 z-0 opacity-70"
        style={{
          background: "radial-gradient(70% 60% at 50% 10%, rgba(90,120,190,0.16), transparent 70%)",
        }}
      />

      <svg
        className="map-svg absolute inset-0 h-full w-full"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="World map showing where Aston Machan is being remembered. Pinch or scroll to zoom, drag to pan."
      >
        <defs>
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

        <g
          transform={transform}
          style={{
            transition: smooth ? "transform 0.43s cubic-bezier(0.22, 1, 0.36, 1)" : "none",
          }}
        >
          <path d={worldMap.sphere} fill="none" stroke="rgba(150,175,225,0.14)" strokeWidth={0.8 * hairline} />
          <path
            d={worldMap.graticule}
            fill="none"
            stroke="rgba(140,165,215,0.08)"
            strokeWidth={0.5 * hairline}
          />

          {GEOMETRY.map((country) => {
            const entry = tally.get(country.code);
            const fill = glow(entry?.count ?? 0, maxCount);
            const isYou = yourCountry?.code === country.code;
            const isSelected = selectedCode === country.code;
            const alive = (entry?.today ?? 0) > 0;

            return (
              <path
                key={country.code}
                d={country.d}
                data-country={country.code}
                className={[
                  "country",
                  fill ? "country-lit" : "country-dim",
                  isYou ? "country-active" : "",
                  alive && awake ? "breathe" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                fill={fill ?? undefined}
                strokeWidth={(isSelected ? 1.6 : isYou ? 1 : 0.5) * hairline}
                stroke={isSelected ? "#ffe6b0" : undefined}
                style={{
                  filter: isSelected ? "drop-shadow(0 0 7px rgba(255,230,160,0.9))" : undefined,
                }}
                onMouseEnter={() => setHoverCode(country.code)}
                onClick={() => pickCountry(country.code)}
              />
            );
          })}

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
              <circle cx={you.cx} cy={you.cy} r={11 * hairline} fill="rgba(255,226,160,0.1)" />
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
                r={3.4 * hairline}
                fill="url(#youGlow)"
                filter="url(#soft)"
              />
              <text
                className="map-label"
                x={you.cx}
                y={you.cy - 7 * hairline}
                textAnchor="middle"
                fill="#ffeecb"
                fontSize={10 * hairline}
                letterSpacing={1.6 * hairline}
              >
                {(yourCountry?.name ?? "").toUpperCase()}
              </text>
            </g>
          ) : null}
        </g>
      </svg>

      {/* ------------------------------------------------------- controls */}
      <div className="absolute top-2.5 right-2.5 z-20 flex flex-col gap-1 rounded-2xl border border-white/10 bg-[#080b16]/85 p-1 shadow-xl backdrop-blur sm:top-3.5 sm:right-3.5">
        <MapButton label="Zoom in" onClick={() => zoomByButton(1.6)} disabled={view.z >= MAX_Z}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 5v14M5 12h14" />
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomByButton(0.625)} disabled={view.z <= MIN_Z}>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M5 12h14" />
        </MapButton>
        {yourCountry && BY_CODE.has(yourCountry.code) ? (
          <MapButton
            label={`Find ${yourCountry.name}`}
            tone="gold"
            onClick={() => {
              focusCountry(yourCountry.code);
              setSelectedCode(yourCountry.code);
            }}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.9}
              d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z"
            />
            <circle cx="12" cy="10" r="2.4" strokeWidth={1.9} />
          </MapButton>
        ) : null}
        {zoomed ? (
          <MapButton label="Reset the view" onClick={resetView}>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 9a8 8 0 0113.9-3.4M20 15A8 8 0 016.1 18.4M4 5v4h4m12 10v-4h-4"
            />
          </MapButton>
        ) : null}
      </div>

      {/* --------------------------------------------------- zoom + hints */}
      <div className="pointer-events-none absolute top-2.5 left-2.5 z-10 flex items-center gap-2 sm:top-3.5 sm:left-3.5">
        <span className="mono rounded-lg border border-white/10 bg-[#080b16]/85 px-2 py-1 text-[10px] text-gold backdrop-blur">
          {view.z.toFixed(1)}×
        </span>
        {!zoomed ? (
          <span className="rounded-lg bg-[#080b16]/70 px-2 py-1 text-[10px] text-mist/75 backdrop-blur">
            {touchUsed ? "Pinch to zoom · drag to pan" : "Tap a country · ⌘/ctrl + scroll to zoom"}
          </span>
        ) : null}
      </div>

      {/* -------------------------------------------- selected country card */}
      {selected ? (
        <div className="animate-fade-up absolute right-2.5 bottom-2.5 left-2.5 z-30 rounded-2xl border border-white/15 bg-[#080b16]/95 p-3.5 shadow-2xl backdrop-blur sm:right-auto sm:bottom-3.5 sm:left-3.5 sm:w-[19rem]">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="text-2xl leading-none">{selectedMeta?.emoji ?? "🌍"}</span>
              <div className="min-w-0">
                <div className="truncate font-display text-base leading-tight text-ink">
                  {selected.name}
                </div>
                <div className="mt-0.5 text-[10px] uppercase tracking-[0.2em] text-mist/70">
                  {selectedMeta?.region || selected.region || "Earth"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCode(null)}
              aria-label="Close"
              className="-mt-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-mist/60 transition hover:bg-white/5 hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-2.5 text-xs text-mist">
            {selectedTally ? (
              <span>
                <strong className="mono text-gold">{selectedTally.count.toLocaleString()}</strong>{" "}
                remembrance{selectedTally.count === 1 ? "" : "s"}
                {selectedTally.today > 0 ? (
                  <span className="text-tide"> · {selectedTally.today} today</span>
                ) : null}
              </span>
            ) : (
              <span className="text-mist/70">No one has remembered her here yet</span>
            )}
            {selectedIsYou ? (
              <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-gold">
                ✦ you
              </span>
            ) : null}
          </div>

          {onSelectCountry && !selectedIsYou ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onSelectCountry(selected.code);
                setSelectedCode(null);
              }}
              className="mt-3 w-full rounded-xl border border-gold/40 bg-gold/15 py-2 text-xs font-medium tracking-wide text-gold-bright transition hover:bg-gold/25 active:scale-[0.98] disabled:opacity-60"
            >
              {busy
                ? "Moving your light…"
                : awake
                  ? "I'm remembering from here"
                  : "Remember from here"}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* -------------------------------------------- desktop hover readout */}
      {!selected && hovered ? (
        <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-20 hidden rounded-xl border border-white/10 bg-[#080b16]/90 px-3 py-1.5 text-xs backdrop-blur sm:block">
          <span className="text-ink/90">
            {COUNTRY_META[hovered.code]?.emoji ?? "🌍"} {hovered.name}
          </span>
          <span className="mono ml-2 text-gold">
            {(hoveredTally?.count ?? 0).toLocaleString()}
          </span>
        </div>
      ) : null}

      {/* ------------------------------------------------------- footnotes */}
      <div className="pointer-events-none absolute right-3.5 bottom-3.5 z-10 hidden text-right text-[10px] uppercase tracking-[0.24em] text-mist/60 lg:block">
        <div>
          <span className="mono text-gold">{stats.countries.length}</span> countries lit
        </div>
        <div className="mt-1">
          <span className="mono text-gold">{stats.total.toLocaleString()}</span> remembrances
        </div>
      </div>
    </div>
  );
}

function MapButton({
  label,
  onClick,
  children,
  disabled,
  tone = "plain",
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  disabled?: boolean;
  tone?: "plain" | "gold";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-10 w-10 touch-manipulation items-center justify-center rounded-xl transition active:scale-90 disabled:opacity-30 sm:h-9 sm:w-9 ${
        tone === "gold" ? "text-gold hover:bg-gold/15" : "text-ink/85 hover:bg-white/10 hover:text-gold"
      }`}
    >
      <svg className="h-[18px] w-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        {children}
      </svg>
    </button>
  );
}

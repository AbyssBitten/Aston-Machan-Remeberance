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
import { describeCountry, type DescribedCountry } from "@/lib/countries";
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

const MAP_WIDTH = worldMap.width; // 1000
const MAP_HEIGHT = worldMap.height; // 500
const MIN_ZOOM = 1.0;
const MAX_ZOOM = 7.0;

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

function clampPan(x: number, y: number, z: number) {
  if (z <= 1) return { x: 0, y: 0 };
  const maxPanX = (z - 1) * 500 + 40;
  const maxPanY = (z - 1) * 250 + 30;
  return {
    x: Math.max(-maxPanX, Math.min(maxPanX, x)),
    y: Math.max(-maxPanY, Math.min(maxPanY, y)),
  };
}

export type WorldMapProps = {
  stats: StatsPayload;
  yourCountry: DescribedCountry | null;
  awake: boolean;
  onSelectCountry?: (countryCode: string) => void;
};

export default function WorldMap({
  stats,
  yourCountry,
  awake,
  onSelectCountry,
}: WorldMapProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState<DescribedCountry | null>(null);
  const [hoveredCountry, setHoveredCountry] = useState<DescribedCountry | null>(null);
  const [hasInteracted, setHasInteracted] = useState(false);

  // Mutable refs for high-frequency pointer / touch tracking without rerendering
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    panRef.current = pan;
  }, [pan]);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    panX: number;
    panY: number;
    moved: boolean;
  } | null>(null);

  const pinchStartRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);

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

  /* ------------------------------------------------ Smooth programmatic zoom */
  const animateTo = useCallback((newZoom: number, newPan: { x: number; y: number }) => {
    const clampedZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
    const clampedPan = clampPan(newPan.x, newPan.y, clampedZoom);
    setIsTransitioning(true);
    setZoom(clampedZoom);
    setPan(clampedPan);
    setHasInteracted(true);
    window.setTimeout(() => setIsTransitioning(false), 460);
  }, []);

  const zoomBy = useCallback(
    (factor: number) => {
      const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor));
      const targetPan = clampPan(panRef.current.x * factor, panRef.current.y * factor, targetZoom);
      animateTo(targetZoom, targetPan);
    },
    [animateTo],
  );

  const resetView = useCallback(() => {
    animateTo(1, { x: 0, y: 0 });
    setSelectedCountry(null);
  }, [animateTo]);

  const focusCountry = useCallback(
    (code: string) => {
      const geo = GEOMETRY_BY_CODE.get(code);
      if (!geo) return;
      const targetZoom = 3.2;
      const targetPan = clampPan(
        (500 - geo.cx) * targetZoom,
        (250 - geo.cy) * targetZoom,
        targetZoom,
      );
      animateTo(targetZoom, targetPan);
      setSelectedCountry(describeCountry(code));
    },
    [animateTo],
  );

  /* ---------------------------------------------- Touch gestures (Mobile) */
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;

    const onTouchStart = (e: TouchEvent) => {
      setHasInteracted(true);

      if (e.touches.length === 2) {
        // Pinch start
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const rect = shell.getBoundingClientRect();
        const midX = (t0.clientX + t1.clientX) / 2 - rect.left;
        const midY = (t0.clientY + t1.clientY) / 2 - rect.top;
        pinchStartRef.current = {
          dist,
          midX,
          midY,
          zoom: zoomRef.current,
          panX: panRef.current.x,
          panY: panRef.current.y,
        };
        dragStartRef.current = null;
        setIsTransitioning(false);
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        // If already zoomed in, prevent page vertical scroll while dragging the map
        if (zoomRef.current > 1.05) {
          e.preventDefault();
        }
        dragStartRef.current = {
          clientX: t.clientX,
          clientY: t.clientY,
          panX: panRef.current.x,
          panY: panRef.current.y,
          moved: false,
        };
        setIsTransitioning(false);
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2 && pinchStartRef.current) {
        e.preventDefault();
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dist = Math.hypot(t0.clientX - t1.clientX, t0.clientY - t1.clientY);
        const factor = dist / pinchStartRef.current.dist;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchStartRef.current.zoom * factor));
        const newPan = clampPan(
          pinchStartRef.current.panX * factor,
          pinchStartRef.current.panY * factor,
          newZoom,
        );
        setZoom(newZoom);
        setPan(newPan);
      } else if (e.touches.length === 1 && dragStartRef.current) {
        const t = e.touches[0];
        const dx = t.clientX - dragStartRef.current.clientX;
        const dy = t.clientY - dragStartRef.current.clientY;
        const dist = Math.hypot(dx, dy);

        if (dist > 7) {
          dragStartRef.current.moved = true;
        }

        // Only pan if zoomed or user deliberately moved horizontally / diagonally
        if (zoomRef.current > 1.05 || Math.abs(dx) > Math.abs(dy) * 1.3) {
          if (zoomRef.current > 1.05) {
            e.preventDefault();
          }
          const rect = shell.getBoundingClientRect();
          const svgDx = (dx / rect.width) * MAP_WIDTH;
          const svgDy = (dy / rect.height) * MAP_HEIGHT;
          const newPan = clampPan(
            dragStartRef.current.panX + svgDx,
            dragStartRef.current.panY + svgDy,
            zoomRef.current,
          );
          setPan(newPan);
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        pinchStartRef.current = null;
      }
      if (e.touches.length === 0) {
        dragStartRef.current = null;
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
  }, []);

  /* ---------------------------------------------- Mouse Wheel & Drag (Desktop) */
  const onMouseDown = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    setHasInteracted(true);
    setIsTransitioning(false);
    setIsDragging(true);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      panX: panRef.current.x,
      panY: panRef.current.y,
      moved: false,
    };
  };

  const onMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    const dx = e.clientX - dragStartRef.current.clientX;
    const dy = e.clientY - dragStartRef.current.clientY;
    if (Math.hypot(dx, dy) > 5) {
      dragStartRef.current.moved = true;
    }
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const svgDx = (dx / rect.width) * MAP_WIDTH;
    const svgDy = (dy / rect.height) * MAP_HEIGHT;
    const newPan = clampPan(
      dragStartRef.current.panX + svgDx,
      dragStartRef.current.panY + svgDy,
      zoomRef.current,
    );
    setPan(newPan);
  };

  const onMouseUp = () => {
    dragStartRef.current = null;
    setIsDragging(false);
  };

  const onWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Only intercept when user is scrolling inside map
    if (Math.abs(e.deltaY) < 2) return;
    e.preventDefault();
    setHasInteracted(true);
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current * factor));
    const targetPan = clampPan(panRef.current.x * factor, panRef.current.y * factor, targetZoom);
    setIsTransitioning(true);
    setZoom(targetZoom);
    setPan(targetPan);
    window.setTimeout(() => setIsTransitioning(false), 240);
  };

  /* --------------------------------------------- Double-tap / double-click */
  const onDoubleAction = useCallback(
    (clientX: number, clientY: number) => {
      const shell = shellRef.current;
      if (!shell) return;
      if (zoomRef.current > 1.8) {
        animateTo(1, { x: 0, y: 0 });
      } else {
        const rect = shell.getBoundingClientRect();
        const clickX = ((clientX - rect.left) / rect.width) * MAP_WIDTH;
        const clickY = ((clientY - rect.top) / rect.height) * MAP_HEIGHT;
        const targetZoom = 2.6;
        const targetPan = clampPan(
          (500 - clickX) * targetZoom,
          (250 - clickY) * targetZoom,
          targetZoom,
        );
        animateTo(targetZoom, targetPan);
      }
    },
    [animateTo],
  );

  const handleCountryClick = useCallback(
    (country: Geometry, clientX: number, clientY: number, timeStamp: number) => {
      // If it was a drag gesture, do not select
      if (dragStartRef.current?.moved) return;

      // Check double-tap using event timeStamp
      const lastTap = lastTapRef.current;
      if (
        lastTap &&
        timeStamp - lastTap.time < 350 &&
        Math.hypot(clientX - lastTap.x, clientY - lastTap.y) < 30
      ) {
        lastTapRef.current = null;
        onDoubleAction(clientX, clientY);
        return;
      }
      lastTapRef.current = { time: timeStamp, x: clientX, y: clientY };

      setSelectedCountry(describeCountry(country.code));
    },
    [onDoubleAction],
  );

  const selectedTally = selectedCountry ? tally.get(selectedCountry.code) : null;
  const isSelectedYou = Boolean(selectedCountry && yourCountry?.code === selectedCountry.code);

  return (
    <div
      ref={shellRef}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={() => {
        dragStartRef.current = null;
        setIsDragging(false);
        setHoveredCountry(null);
      }}
      onWheel={onWheel}
      className="map-shell relative min-h-[340px] sm:min-h-[440px] md:min-h-[490px] select-none"
      style={{
        cursor: zoom > 1 ? (isDragging ? "grabbing" : "grab") : "default",
        touchAction: zoom > 1.05 ? "none" : "pan-y",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 60% at 50% 12%, rgba(90,120,190,0.16), transparent 70%)",
        }}
      />

      {/* ---------------------------------------------------- SVG Map Canvas */}
      <svg
        className="map-svg block w-full h-auto"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="Interactive world map of Aston Machan remembrance"
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

        <rect x="0" y="0" width={MAP_WIDTH} height={MAP_HEIGHT} fill="url(#ocean)" />

        {/* Dynamic Zoom & Pan Group */}
        <g
          transform={`translate(${500 + pan.x} ${250 + pan.y}) scale(${zoom}) translate(-500 -250)`}
          style={{
            transition: isTransitioning
              ? "transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
          }}
        >
          <path
            d={worldMap.sphere}
            fill="none"
            stroke="rgba(150,175,225,0.13)"
            strokeWidth={0.8 / Math.sqrt(zoom)}
          />
          <path
            d={worldMap.graticule}
            fill="none"
            stroke="rgba(140,165,215,0.075)"
            strokeWidth={0.5 / Math.sqrt(zoom)}
          />

          {/* Countries */}
          <g>
            {GEOMETRY.map((country) => {
              const entry = tally.get(country.code);
              const tone = glow(entry?.count ?? 0, maxCount);
              const isYou = yourCountry?.code === country.code;
              const isSelected = selectedCountry?.code === country.code;
              const alive = (entry?.today ?? 0) > 0;

              const className = [
                "country",
                tone ? "country-lit" : "country-dim",
                isYou ? "country-active" : "",
                isSelected ? "stroke-gold-bright" : "",
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
                  strokeWidth={(isSelected ? 1.4 : isYou ? 1.0 : 0.5) / Math.sqrt(zoom)}
                  style={{
                    opacity: tone ? 1 : 0.95,
                    filter: isSelected
                      ? "drop-shadow(0 0 8px rgba(255, 230, 150, 0.9))"
                      : undefined,
                  }}
                  onMouseEnter={() => setHoveredCountry(describeCountry(country.code))}
                  onClick={(e) => handleCountryClick(country, e.clientX, e.clientY, e.timeStamp)}
                />
              );
            })}
          </g>

          {/* Recent live radar pings */}
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

          {/* You are here marker */}
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
                strokeWidth={0.6 / Math.sqrt(zoom)}
              />
              <text
                className="map-label"
                x={you.cx + 20}
                y={you.cy - 16}
                fill="#ffeecb"
                fontSize={Math.max(8, 10 / Math.sqrt(zoom))}
                letterSpacing="2"
                style={{ textTransform: "uppercase" }}
              >
                {(yourCountry?.name ?? "").toUpperCase()}
              </text>
            </g>
          ) : null}
        </g>
      </svg>

      {/* ------------------------------------------- Floating Map Controls */}
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20 flex flex-col gap-1.5 rounded-xl border border-white/10 bg-[#080b16]/90 p-1 backdrop-blur shadow-xl">
        <button
          type="button"
          onClick={() => zoomBy(1.4)}
          aria-label="Zoom in"
          title="Zoom in"
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-ink/90 transition hover:bg-white/10 hover:text-gold active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M12 4v16m8-8H4" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => zoomBy(0.71)}
          aria-label="Zoom out"
          title="Zoom out"
          className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-ink/90 transition hover:bg-white/10 hover:text-gold active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M20 12H4" />
          </svg>
        </button>

        {zoom > 1.05 ? (
          <button
            type="button"
            onClick={resetView}
            aria-label="Reset map zoom"
            title="Reset map view"
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-ink/90 transition hover:bg-white/10 hover:text-gold active:scale-95"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        ) : null}

        {yourCountry && yourCountry.code !== "ZZ" ? (
          <button
            type="button"
            onClick={() => focusCountry(yourCountry.code)}
            aria-label="Focus on my country"
            title={`Focus on ${yourCountry.name}`}
            className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-lg text-gold transition hover:bg-white/10 hover:text-gold-bright active:scale-95"
          >
            <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
          </button>
        ) : null}
      </div>

      {/* -------------------------------- Mobile Touch Hint & Zoom Indicator */}
      <div className="pointer-events-none absolute top-3 left-3 z-10 flex items-center gap-2 text-[10px] text-mist/70">
        <span className="rounded-md border border-white/10 bg-[#080b16]/80 px-2 py-0.5 font-mono text-[10px] text-gold">
          {zoom.toFixed(1)}×
        </span>
        {!hasInteracted ? (
          <span className="hidden sm:inline-block rounded-md bg-black/40 px-2 py-0.5 text-[10px] backdrop-blur">
            Scroll or pinch to zoom · Drag to pan · Tap country to inspect
          </span>
        ) : null}
      </div>

      {/* --------------------------- Selected Country Bottom Card (Mobile & Desktop) */}
      {selectedCountry ? (
        <div className="animate-fade-up absolute bottom-3 left-3 right-3 sm:left-4 sm:right-auto sm:max-w-xs z-30 rounded-2xl border border-white/15 bg-[#080b16]/95 p-4 shadow-2xl backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="text-2xl leading-none">{selectedCountry.emoji || "🌍"}</span>
              <div>
                <div className="font-display text-base leading-tight text-ink font-semibold">
                  {selectedCountry.name}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-mist/70 mt-0.5">
                  {selectedCountry.region || "World"}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCountry(null)}
              className="rounded-md p-1 text-mist/60 hover:text-ink transition"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-xs text-mist">
            <span>
              <strong className="mono font-semibold text-gold">
                {(selectedTally?.count ?? 0).toLocaleString()}
              </strong>{" "}
              remembrances
              {(selectedTally?.today ?? 0) > 0 ? (
                <span className="ml-1 text-tide font-normal">
                  (+{selectedTally?.today} today)
                </span>
              ) : null}
            </span>
            {isSelectedYou ? (
              <span className="text-[10px] uppercase tracking-wider text-gold font-medium">
                ✦ Your country
              </span>
            ) : null}
          </div>

          <div className="mt-3 flex gap-2">
            {awake && !isSelectedYou && onSelectCountry ? (
              <button
                type="button"
                onClick={() => {
                  onSelectCountry(selectedCountry.code);
                  setSelectedCountry(null);
                }}
                className="flex-1 rounded-lg border border-gold/40 bg-gold/15 py-1.5 px-2.5 text-center text-xs font-medium text-gold-bright transition hover:bg-gold/25 active:scale-[0.98]"
              >
                Remember from here instead
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => focusCountry(selectedCountry.code)}
              className="rounded-lg border border-white/10 bg-white/5 py-1.5 px-3 text-xs text-mist hover:text-ink hover:bg-white/10 transition"
              title="Zoom in to this country"
            >
              Zoom in
            </button>
          </div>
        </div>
      ) : null}

      {/* Desktop hover quick badge (when not actively selected) */}
      {!selectedCountry && hoveredCountry ? (
        <div className="pointer-events-none hidden sm:block absolute bottom-3 left-4 z-20 rounded-lg border border-white/10 bg-[#080b16]/90 px-3 py-1.5 text-xs text-ink shadow-lg backdrop-blur">
          <span>
            {hoveredCountry.emoji} {hoveredCountry.name}
          </span>
          <span className="ml-2 text-gold mono">
            {(tally.get(hoveredCountry.code)?.count ?? 0).toLocaleString()}
          </span>
        </div>
      ) : null}

      {/* Bottom status bar info */}
      <div className="pointer-events-none absolute bottom-3 right-4 hidden md:flex items-center gap-4 text-right text-[10px] uppercase tracking-[0.24em] text-mist/60">
        <div>
          <span className="text-gold mono">{stats.countries.length}</span> countries lit
        </div>
        <div>
          <span className="text-gold mono">{stats.total.toLocaleString()}</span> total
        </div>
      </div>
    </div>
  );
}

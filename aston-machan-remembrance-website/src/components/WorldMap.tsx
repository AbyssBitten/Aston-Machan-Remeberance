"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  bw: number;
  bh: number;
};

const GEOMETRY = worldMap.countries as Geometry[];
const GEOMETRY_BY_CODE = new Map(GEOMETRY.map((c) => [c.code, c]));

const MIN_K = 1;
const MAX_K = 9;
const VBW = worldMap.width;
const VBH = worldMap.height;

type Tally = Map<string, { count: number; today: number; emoji: string }>;

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

function tone(count: number, max: number) {
  if (count <= 0) return null;
  const t = Math.pow(count / Math.max(1, max), 0.5);
  return {
    fill: `rgba(244, ${Math.round(198 + 34 * t)}, ${Math.round(120 + 40 * t)}, ${(
      0.2 +
      0.68 * t
    ).toFixed(3)})`,
  };
}

/* --------------------------------------------------------------------------
 * Country paths. Memoised on the tally so panning, zooming and hovering never
 * re-render 177 <path> nodes.
 * ----------------------------------------------------------------------- */
const CountryPaths = memo(function CountryPaths({
  tally,
  maxCount,
  youCode,
  awake,
}: {
  tally: Tally;
  maxCount: number;
  youCode: string | null;
  awake: boolean;
}) {
  return (
    <g>
      {GEOMETRY.map((country) => {
        const entry = tally.get(country.code);
        const lit = tone(entry?.count ?? 0, maxCount);
        const isYou = country.code === youCode;
        const alive = (entry?.today ?? 0) > 0;
        return (
          <path
            key={country.code}
            data-code={country.code}
            d={country.d}
            className={[
              "country",
              lit ? "country-lit" : "country-dim",
              isYou ? "country-active" : "",
              alive && awake ? "breathe" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            fill={lit?.fill ?? undefined}
            strokeWidth={isYou ? 0.9 : 0.5}
          />
        );
      })}
    </g>
  );
});

export default function WorldMap({
  stats,
  yourCountry,
  awake,
}: {
  stats: StatsPayload;
  yourCountry: DescribedCountry | null;
  awake: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const view = useRef({ k: 1, x: 0, y: 0 });
  const size = useRef({ w: 0, h: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    startK: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    dist: number;
    moved: number;
    beganAt: number;
  } | null>(null);
  const lastTap = useRef(0);
  const rafPending = useRef(false);

  const [zoomUi, setZoomUi] = useState(1);
  const [vpSize, setVpSize] = useState({ w: 0, h: 0 });
  const [panning, setPanning] = useState(false);
  const [interacted, setInteracted] = useState(false);
  const [hover, setHover] = useState<{
    code: string;
    x: number;
    y: number;
    sticky: boolean;
  } | null>(null);

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

  /* ------------------------------------------------------------ transform */
  const measure = useCallback(() => {
    const el = viewportRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      size.current = { w: rect.width, h: rect.height };
    }
    return size.current;
  }, []);

  /** Mirrors the ref into state, but only on resize — tooltips need render-safe numbers. */
  const syncSize = useCallback(() => {
    const { w, h } = measure();
    setVpSize((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
  }, [measure]);

  const apply = useCallback((animated: boolean) => {
    const { w, h } = size.current;
    const next = view.current;
    next.k = clamp(MIN_K, next.k, MAX_K);
    next.x = clamp(w - w * next.k, next.x, 0);
    next.y = clamp(h - h * next.k, next.y, 0);
    const el = layerRef.current;
    if (!el) return;
    el.style.transition = animated ? "transform 620ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    el.style.transform = `translate3d(${next.x.toFixed(2)}px, ${next.y.toFixed(2)}px, 0) scale(${
      next.k.toFixed(4)
    })`;
  }, []);

  const commit = useCallback(() => {
    setZoomUi(view.current.k);
    setInteracted(true);
  }, []);

  /** Zoom about a point in viewport pixels, keeping that point anchored. */
  const zoomAbout = useCallback(
    (factor: number, px: number, py: number, animated = true) => {
      measure();
      const next = view.current;
      const k = clamp(MIN_K, next.k * factor, MAX_K);
      const ratio = k / next.k;
      next.x = px - (px - next.x) * ratio;
      next.y = py - (py - next.y) * ratio;
      next.k = k;
      if (k <= MIN_K + 0.001) {
        next.x = 0;
        next.y = 0;
      }
      apply(animated);
      commit();
    },
    [apply, commit, measure],
  );

  const focusPoint = useCallback(
    (cx: number, cy: number, bw: number, bh: number) => {
      const { w, h } = measure();
      if (!w || !h) return;
      // viewBox -> viewport pixels
      const sx = w / VBW;
      const sy = h / VBH;
      const k = clamp(1.4, Math.min(w / (bw * sx * 1.9), h / (bh * sy * 2.4)), 5.5);
      view.current.k = k;
      view.current.x = w / 2 - k * cx * sx;
      view.current.y = h / 2 - k * cy * sy;
      apply(true);
      commit();
    },
    [apply, commit, measure],
  );

  const fit = useCallback(() => {
    view.current = { k: 1, x: 0, y: 0 };
    apply(true);
    commit();
  }, [apply, commit]);

  const centerOnMe = useCallback(() => {
    if (!you) {
      zoomAbout(1.8, size.current.w / 2, size.current.h / 2);
      return;
    }
    focusPoint(you.cx, you.cy, you.bw, you.bh);
  }, [you, focusPoint, zoomAbout]);

  /* --------------------------------------------------- sizing + wheel zoom */
  useEffect(() => {
    syncSize();
    apply(false);
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      syncSize();
      apply(false);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [syncSize, apply]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    // Native listener so we can preventDefault (React registers wheel passive).
    const onWheel = (event: WheelEvent) => {
      const wantsZoom = event.ctrlKey || event.metaKey;
      if (!wantsZoom) return; // leave plain scrolling to the page
      event.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAbout(
        Math.exp(-event.deltaY * 0.0022),
        event.clientX - rect.left,
        event.clientY - rect.top,
        false,
      );
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAbout]);

  /* ------------------------------------------------------ pointer gestures */
  const beginGesture = useCallback(
    (clientX: number, clientY: number) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      const first = pointers.current.values().next().value as { x: number; y: number } | undefined;
      const px = rect ? clientX - rect.left : 0;
      const py = rect ? clientY - rect.top : 0;
      gesture.current = {
        startK: view.current.k,
        startX: view.current.x,
        startY: view.current.y,
        originX: first?.x ?? px,
        originY: first?.y ?? py,
        dist: 0,
        moved: 0,
        beganAt: performance.now(),
      };
    },
    [],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const rect = viewportRef.current?.getBoundingClientRect();
      if (!rect) return;
      size.current = { w: rect.width, h: rect.height };
      const px = event.clientX - rect.left;
      const py = event.clientY - rect.top;
      pointers.current.set(event.pointerId, { x: px, y: py });
      viewportRef.current?.setPointerCapture?.(event.pointerId);
      if (pointers.current.size === 1) {
        beginGesture(event.clientX, event.clientY);
        if (view.current.k > MIN_K + 0.001) setPanning(true);
      } else if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        gesture.current = {
          startK: view.current.k,
          startX: view.current.x,
          startY: view.current.y,
          originX: (a.x + b.x) / 2,
          originY: (a.y + b.y) / 2,
          dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          moved: 0,
          beganAt: performance.now(),
        };
        setPanning(true);
        setHover(null);
      }
    },
    [beginGesture],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const active = pointers.current.get(event.pointerId);
      const rect = viewportRef.current?.getBoundingClientRect();

      /* Mouse hover tooltip — routed through a single delegated hit-test, so the
         177 paths need no listeners of their own. */
      if (!active && event.pointerType === "mouse" && !gesture.current && rect) {
        const target = event.target as Element | null;
        const node = target?.closest?.("[data-code]") as Element | null;
        const code = node?.getAttribute("data-code") ?? null;
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        if (rafPending.current) return;
        rafPending.current = true;
        requestAnimationFrame(() => {
          rafPending.current = false;
          setHover((prev) => {
            if (!code) return prev && !prev.sticky ? null : prev;
            if (prev && prev.code === code && !prev.sticky) {
              return { ...prev, x, y };
            }
            return { code, x, y, sticky: false };
          });
        });
        return;
      }

      if (!active || !gesture.current) return;
      if (rect) {
        active.x = event.clientX - rect.left;
        active.y = event.clientY - rect.top;
      }

      const g = gesture.current;
      if (pointers.current.size >= 2) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const k = clamp(MIN_K, g.startK * (dist / g.dist), MAX_K);
        const ratio = k / g.startK;
        view.current.k = k;
        view.current.x = midX - (g.originX - g.startX) * ratio;
        view.current.y = midY - (g.originY - g.startY) * ratio;
        if (k <= MIN_K + 0.001) {
          view.current.x = 0;
          view.current.y = 0;
        }
        g.moved = Math.max(
          g.moved,
          Math.abs(dist - g.dist) + Math.hypot(midX - g.originX, midY - g.originY),
        );
        apply(false);
        return;
      }

      const dx = active.x - g.originX;
      const dy = active.y - g.originY;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));

      // One finger / one mouse: pan, but only once zoomed in — at fit zoom the
      // vertical swipe is left to the browser so the page still scrolls freely.
      if (g.startK <= MIN_K + 0.001) return;
      view.current.x = g.startX + dx;
      view.current.y = g.startY + dy;
      apply(false);
    },
    [apply],
  );

const endGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const wasTracking = pointers.current.has(event.pointerId);
      pointers.current.delete(event.pointerId);
      viewportRef.current?.releasePointerCapture?.(event.pointerId);

      const g = gesture.current;
      if (pointers.current.size === 0) {
        gesture.current = null;
        setPanning(false);
        if (wasTracking && g) {
          const quick = performance.now() - g.beganAt < 400;
          const still = g.moved < 12;

          // Single tap on mobile selects the country without resetting zoom
          if (quick && still && event.pointerType !== "mouse") {
            const rect = viewportRef.current?.getBoundingClientRect();
            if (rect) {
              const px = event.clientX - rect.left;
              const py = event.clientY - rect.top;
              
              // Pointer capture retargets the event, so hit-test the real pixel.
              const node = document
                .elementFromPoint(event.clientX, event.clientY)
                ?.closest?.("[data-code]");
              const code = node?.getAttribute("data-code");
              if (code) {
                setHover({ code, x: px, y: py, sticky: true });
                setInteracted(true);
              } else {
                setHover(null);
              }
            }
          }
        }
        commit();
      } else if (pointers.current.size === 1) {
        // Pinch ended into a drag: re-anchor so the map does not jump.
        const [only] = [...pointers.current.values()];
        gesture.current = {
          startK: view.current.k,
          startX: view.current.x,
          startY: view.current.y,
          originX: only.x,
          originY: only.y,
          dist: 0,
          moved: g?.moved ?? 0,
          beganAt: g?.beganAt ?? performance.now(),
        };
      }
    },
    [commit],
  );

  /* Auto-dismiss tapped tooltips so the phone view stays clean. */
  useEffect(() => {
    if (!hover?.sticky) return;
    const id = window.setTimeout(() => setHover(null), 3200);
    return () => window.clearTimeout(id);
  }, [hover]);

  const info = hover
    ? { ...buildInfo(hover.code, tally, yourCountry?.code), x: hover.x, y: hover.y }
    : null;
  const zoomed = zoomUi > MIN_K + 0.02;

  return (
    <div className="map-shell">
      <div
        ref={viewportRef}
        className="map-viewport"
        data-panning={panning ? "true" : "false"}
        style={{ touchAction: zoomed ? "none" : "pan-y" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endGesture}
        onPointerCancel={endGesture}
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse" && !panning) setHover(null);
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(70% 60% at 50% 12%, rgba(90,120,190,0.16), transparent 70%)",
          }}
        />

        <div ref={layerRef} className="map-layer">
          <svg
            className="map-svg"
            viewBox={`0 0 ${VBW} ${VBH}`}
            role="img"
            aria-label="World map. Brighter countries have more people remembering Aston Machan. Pinch or use the controls to zoom."
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

            <rect x="0" y="0" width={VBW} height={VBH} fill="url(#ocean)" />
            <path d={worldMap.sphere} fill="none" stroke="rgba(150,175,225,0.13)" strokeWidth="0.8" />
            <path
              d={worldMap.graticule}
              fill="none"
              stroke="rgba(140,165,215,0.075)"
              strokeWidth="0.5"
            />

            <CountryPaths
              tally={tally}
              maxCount={maxCount}
              youCode={yourCountry?.code ?? null}
              awake={awake}
            />

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

        {info ? (
          <div
            className="map-tip"
            style={{
              left: clamp(84, info.x, Math.max(88, vpSize.w - 84)),
              top: Math.max(58, info.y),
            }}
          >
            <div className="font-medium tracking-wide text-[#f6f4ff]">{info.title}</div>
            <div className="mt-0.5 text-[11px] text-mist">
              {info.count > 0 ? (
                <>
                  <span className="text-gold mono">{info.count.toLocaleString()}</span>{" "}
                  remembrance{info.count === 1 ? "" : "s"}
                  {info.today > 0 ? <span className="text-tide"> · {info.today} today</span> : null}
                </>
              ) : (
                <span className="text-mist/70">Not remembered here yet</span>
              )}
            </div>
            {info.isYou ? (
              <div className="mt-1 text-[10px] uppercase tracking-[0.25em] text-gold">
                you are here
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="map-controls" onPointerDown={(event) => event.stopPropagation()}>
          <button
            type="button"
            className="map-ctrl"
            aria-label="Zoom in on the map"
            onClick={() => zoomAbout(1.7, size.current.w / 2, size.current.h / 2)}
          >
            <IconPlus />
          </button>
          <button
            type="button"
            className="map-ctrl"
            aria-label="Zoom out on the map"
            onClick={() => zoomAbout(1 / 1.7, size.current.w / 2, size.current.h / 2)}
          >
            <IconMinus />
          </button>
          <button
            type="button"
            className="map-ctrl"
            aria-label="Centre the map on the country you remember from"
            disabled={!you}
            onClick={centerOnMe}
          >
            <IconTarget />
          </button>
        </div>

        <div className="map-zoom-badge" data-visible={zoomed ? "true" : "false"}>
          <span className="mono">{zoomUi.toFixed(1)}×</span>
          <span className="hidden sm:inline"> · drag to pan</span>
        </div>

        <div className="pointer-events-none absolute bottom-4 left-5 hidden items-center gap-3 text-[10px] uppercase tracking-[0.28em] text-mist/70 sm:flex">
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

        <div className="pointer-events-none absolute right-5 bottom-4 hidden text-right text-[10px] uppercase tracking-[0.28em] text-mist/70 sm:block">
          <div>
            <span className="text-gold mono">{stats.countries.length}</span> countries remembering
          </div>
          <div className="mt-1">
            <span className="text-gold mono">{stats.total.toLocaleString()}</span> remembrances all
            time
          </div>
        </div>

        <p className="map-hint" data-visible={!interacted ? "true" : "false"}>
          <span className="sm:hidden">Pinch, or use +, to look closer · tap a country</span>
          <span className="hidden sm:inline">
            Hold ⌘ / Ctrl and scroll to zoom · tap a country for detail
          </span>
        </p>
      </div>
    </div>
  );
}

function buildInfo(code: string, tally: Tally, yourCode?: string) {
  const geo = GEOMETRY_BY_CODE.get(code);
  const entry = tally.get(code);
  const name = geo?.name ?? code;
  return {
    title: entry?.emoji ? `${entry.emoji} ${name}` : name,
    count: entry?.count ?? 0,
    today: entry?.today ?? 0,
    isYou: code === yourCode,
  };
}

/* -------------------------------------------------------------- tiny icons */
const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconPlus() {
  return (
    <svg className="h-4 w-4" {...iconProps}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function IconMinus() {
  return (
    <svg className="h-4 w-4" {...iconProps}>
      <path d="M5 12h14" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg className="h-4 w-4" {...iconProps}>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M12 1.8v3M12 19.2v3M1.8 12h3M19.2 12h3" />
    </svg>
  );
}

function IconFit() {
  return (
    <svg className="h-4 w-4" {...iconProps}>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
    </svg>
  );
}

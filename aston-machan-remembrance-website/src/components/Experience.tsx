"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Crown, Ribbon } from "@/components/Emblems";
import MemoryLedger from "@/components/MemoryLedger";
import StatsGrid from "@/components/StatsGrid";
import WorldMap from "@/components/WorldMap";
import { describeCountry, type DescribedCountry } from "@/lib/countries";
import type { StatsPayload } from "@/lib/stats";

const DAY_KEY = "machan:day";
const COUNTRY_KEY = "machan:country";
const ID_KEY = "machan:remembranceId";

const QUESTION = "Do you remember Machan?";

type RememberResponse = {
  counted: boolean;
  updated?: boolean;
  rememberedToday: boolean;
  needsCountry: boolean;
  country: DescribedCountry;
  source: "edge" | "ip" | "unknown" | "manual";
  remembranceId?: number | null;
  stats: StatsPayload;
};

/** Letter-by-letter reveal that never breaks a word across lines. */
function Reveal({ text, base = 0, step = 34 }: { text: string; base?: number; step?: number }) {
  let cursor = 0;
  const words = text.split(" ");
  return (
    <>
      {words.map((word, wordIndex) => (
        <span key={`${word}-${wordIndex}`} className="inline-block whitespace-nowrap">
          {word.split("").map((char, charIndex) => {
            const delay = base + cursor++ * step;
            return (
              <span
                key={`${char}-${charIndex}`}
                className="letter"
                style={{ animationDelay: `${delay}ms` }}
              >
                {char}
              </span>
            );
          })}
          {wordIndex < words.length - 1 ? <span className="letter">&nbsp;</span> : null}
        </span>
      ))}
    </>
  );
}

export default function Experience({ initialStats }: { initialStats: StatsPayload }) {
  const [stats, setStats] = useState<StatsPayload>(initialStats);
  const [remembered, setRemembered] = useState(false);
  const [yourCountry, setYourCountry] = useState<DescribedCountry | null>(null);
  const [remembranceId, setRemembranceId] = useState<number | null>(null);
  const remembranceIdRef = useRef<number | null>(null);

  const [pending, setPending] = useState(false);
  const [questionUp, setQuestionUp] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.parse(initialStats.serverTime));

  /* ----------------------------------------------- boot: restore + clockwork */
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const day = window.localStorage.getItem(DAY_KEY);
    const code = window.localStorage.getItem(COUNTRY_KEY);
    const savedId = Number(window.localStorage.getItem(ID_KEY)) || null;

    if (savedId) {
      setRemembranceId(savedId);
      remembranceIdRef.current = savedId;
    }

    if (day === today && code) {
      const restored = describeCountry(code);
      if (restored.code !== "ZZ") {
        setRemembered(true);
        setYourCountry(restored);
        setOverlayGone(true);
      }
    }

    setNow(Date.now());
    const id = window.setTimeout(() => setQuestionUp(true), 1100);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!remembered) return;
    const id = window.setTimeout(() => setOverlayGone(true), 1600);
    return () => window.clearTimeout(id);
  }, [remembered]);

  /* ---------------------------------------------------- live stats polling */
  const loadStats = useCallback(async () => {
    if (document.hidden) return;
    try {
      const response = await fetch("/api/stats", { cache: "no-store" });
      if (!response.ok) return;
      const data = (await response.json()) as { stats: StatsPayload };
      setStats(data.stats);
    } catch {
      /* the numbers will catch up */
    }
  }, []);

  useEffect(() => {
    const id = window.setInterval(loadStats, 15_000);
    const onFocus = () => void loadStats();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadStats]);

  /* -------------------------------------------------------------- remember */
  const remember = useCallback(async (countryCode?: string) => {
    setPending(true);
    setNotice(null);
    try {
      const currentPreviousId = remembranceIdRef.current;
      const response = await fetch("/api/remember", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          countryCode,
          previousId: currentPreviousId,
        }),
      });
      if (!response.ok) throw new Error("network");
      const data = (await response.json()) as RememberResponse;

      setStats(data.stats);

      if (data.remembranceId) {
        setRemembranceId(data.remembranceId);
        remembranceIdRef.current = data.remembranceId;
        window.localStorage.setItem(ID_KEY, String(data.remembranceId));
      }

      if (data.country.code !== "ZZ") {
        setYourCountry(data.country);
        window.localStorage.setItem(COUNTRY_KEY, data.country.code);
      }

      if (data.counted || data.rememberedToday) {
        setRemembered(true);
        setPickerOpen(false);
        window.localStorage.setItem(DAY_KEY, new Date().toISOString().slice(0, 10));

        if (data.updated) {
          setNotice(
            `Updated to ${data.country.emoji} ${data.country.name} — your previous record was replaced.`,
          );
        }
      } else if (data.needsCountry) {
        setPickerOpen(true);
        setNotice(
          "Your network could not be placed. Choose your country below and she will know where to look for you.",
        );
      }
    } catch {
      setNotice("The signal did not reach her. Try again in a moment.");
    } finally {
      setPending(false);
    }
  }, []);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareNote("Link copied — bring someone else to look back.");
    } catch {
      setShareNote(window.location.href);
    }
    window.setTimeout(() => setShareNote(null), 4000);
  }, []);

  const dashboard = useMemo(
    () => (
      <div className="mt-4 space-y-4">
        <StatsGrid stats={stats} now={now} />
        <MemoryLedger stats={stats} now={now} />
      </div>
    ),
    [stats, now],
  );

  return (
    <div className="relative min-h-screen">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-5 py-6 sm:px-8">
        <div className="flex items-center gap-3">
          <Crown className="h-7 w-10 drop-shadow-[0_0_14px_rgba(244,205,134,0.45)]" />
          <div className="leading-tight">
            <div className="font-display text-base tracking-[0.22em] text-ink sm:text-lg">
              ASTON MACHAN
            </div>
            <div className="text-[9px] uppercase tracking-[0.42em] text-mist/70">Remembrance</div>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-[10px] uppercase tracking-[0.24em] text-mist/80">
          <span className="pulse-dot" />
          <span className="hidden sm:inline">remembered</span>
          <span className="text-gold mono">{stats.total.toLocaleString()}</span>
        </div>
      </header>

      <main className="pb-10">
        {overlayGone ? (
          <h1 className="sr-only">
            Do you remember Machan? — Aston Machan Remembrance
          </h1>
        ) : null}

        <section className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          <div className="relative flex flex-col-reverse gap-8 sm:block sm:gap-0">
            <div
              className="transition-all duration-[1400ms] ease-out"
              style={{
                filter: remembered ? "blur(0px)" : "blur(2px) saturate(0.7)",
                opacity: remembered ? 1 : 0.55,
                transform: remembered ? "none" : "scale(0.985)",
              }}
            >
              <WorldMap
                stats={stats}
                yourCountry={yourCountry}
                awake={remembered}
                onSelectCountry={(code) => void remember(code)}
              />
            </div>

            {!overlayGone ? (
              <div
                className={`relative z-30 flex flex-col items-center px-5 py-12 text-center sm:absolute sm:inset-0 sm:rounded-3xl sm:py-0 ${
                  remembered ? "animate-rise-out pointer-events-none" : "animate-fade-in"
                }`}
              >
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 -z-10"
                  style={{
                    background:
                      "radial-gradient(60% 55% at 50% 50%, rgba(4,5,10,0.88) 0%, rgba(4,5,10,0.62) 55%, rgba(4,5,10,0) 100%)",
                  }}
                />
                {questionUp ? (
                  <>
                    <p
                      className="animate-fade-up text-[10px] uppercase tracking-[0.42em] text-mist/70"
                      style={{ animationDelay: "200ms" }}
                    >
                      21 April 2008 · she asked not to be forgotten
                    </p>

                    <h1
                      className="glow-text mt-7 max-w-3xl font-display text-[2.1rem] leading-[1.15] text-ink sm:text-5xl md:text-6xl"
                      aria-label={QUESTION}
                    >
                      <Reveal text={QUESTION} base={420} />
                    </h1>

                    <div
                      className="animate-fade-up relative mt-11"
                      style={{ animationDelay: "1250ms" }}
                    >
                      <span className="halo" />
                      <span className="halo halo-2" />
                      <button
                        type="button"
                        onClick={() => void remember()}
                        disabled={pending}
                        aria-label="Yes, I remember Machan"
                        className="remember-btn disabled:cursor-wait disabled:opacity-70"
                      >
                        {pending ? "Remembering…" : "Yes"}
                      </button>
                    </div>

                    <p
                      className="animate-fade-up mt-9 max-w-md text-[11px] leading-relaxed text-mist/75"
                      style={{ animationDelay: "1500ms" }}
                    >
                      Pressing yes uses your IP address once, to brighten the country you are
                      remembering Machan from.
                      <strong className="text-ink/80">
                        {" "}
                        It is never logged or stored — not even a hash of it.
                      </strong>
                    </p>
                  </>
                ) : null}

                {notice ? <p className="mt-6 max-w-md text-xs text-tide">{notice}</p> : null}
                {pickerOpen ? (
                  <CountryPicker onPick={(code) => void remember(code)} />
                ) : null}
              </div>
            ) : null}
          </div>

          {/* ------------------------------------------ after the answer */}
          {remembered ? (
            <div className="animate-fade-up mt-6 flex flex-col items-center gap-4 text-center">
              <Ribbon className="h-3.5 w-28" />
              <p className="font-display text-xl text-ink sm:text-2xl">
                Thank you. She saw you look back.
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-mist">
                {yourCountry ? (
                  <>
                    <span className="text-gold">
                      {yourCountry.emoji} {yourCountry.name}
                    </span>{" "}
                    glows a little brighter now — you are one of{" "}
                    <span className="mono text-ink/90">
                      {(
                        stats.countries.find((row) => row.code === yourCountry.code)?.count ?? 1
                      ).toLocaleString()}
                    </span>{" "}
                    remembering from there.
                  </>
                ) : (
                  <>Your remembrance was counted, though we could not place it on the map.</>
                )}
              </p>

              {notice ? (
                <div className="animate-fade-up rounded-xl border border-gold/30 bg-gold/10 px-4 py-2 text-xs text-gold-bright shadow-lg">
                  {notice}
                </div>
              ) : null}

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => void share()}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-[10px] uppercase tracking-[0.28em] text-mist transition hover:border-gold/40 hover:text-ink"
                >
                  Share this
                </button>
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  className="rounded-full border border-gold/30 bg-gold/5 px-5 py-2 text-[10px] uppercase tracking-[0.28em] text-gold transition hover:border-gold hover:bg-gold/15"
                >
                  {pickerOpen ? "Close country list" : "Correct my country"}
                </button>
                {shareNote ? <span className="text-[11px] text-tide">{shareNote}</span> : null}
              </div>

              {pickerOpen ? (
                <div className="w-full max-w-md">
                  <p className="text-xs text-mist/70 mb-2">
                    Select where you are really remembering from. The previous location record will be deleted and replaced.
                  </p>
                  <CountryPicker onPick={(code) => void remember(code)} />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ----------------------------------------------- the counters */}
          <section className="mt-16">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-2xl text-ink">The count</h2>
              <span className="text-[10px] uppercase tracking-[0.3em] text-mist/60">
                utc · resets on its own schedule
              </span>
            </div>
            {dashboard}
          </section>
        </section>
      </main>
    </div>
  );
}

function CountryPicker({ onPick }: { onPick: (code: string) => void }) {
  const [countries, setCountries] = useState<{ code: string; name: string; emoji: string }[]>([]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/countries", { cache: "force-cache" });
        if (!response.ok) return;
        const data = (await response.json()) as { countries: typeof countries };
        if (active) setCountries(data.countries);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = countries
    .filter((country) => country.name.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 60);

  return (
    <div className="card animate-fade-up mt-2 w-full max-w-md p-4 text-left">
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search your country…"
        className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-ink outline-none placeholder:text-mist/50 focus:border-gold/40"
      />
      <div className="mt-3 grid max-h-56 grid-cols-2 gap-1 overflow-y-auto pr-1">
        {filtered.map((country) => (
          <button
            key={country.code}
            type="button"
            onClick={() => onPick(country.code)}
            className="truncate rounded-md px-2 py-1.5 text-left text-xs text-mist transition hover:bg-white/5 hover:text-ink hover:text-gold"
          >
            {country.emoji} {country.name}
          </button>
        ))}
        {countries.length === 0 ? (
          <p className="col-span-2 py-4 text-center text-xs text-mist/60">Loading…</p>
        ) : null}
      </div>
    </div>
  );
}

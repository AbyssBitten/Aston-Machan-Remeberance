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

const QUESTION = "Do you remember Machan?";

type Mode =
  | "remembered"
  | "corrected"
  | "recorded"
  | "already"
  | "needs-country"
  | "throttled"
  | "error"
  | "invalid";

type RememberResponse = {
  mode: Mode;
  country: DescribedCountry | null;
  source: "edge" | "ip" | "unknown" | "manual" | "none";
  counted: boolean;
  replaced: boolean;
  replacedFrom?: string | null;
  needsCountry?: boolean;
  stats: StatsPayload;
};

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
  const [source, setSource] = useState<RememberResponse["source"]>("unknown");
  const [pending, setPending] = useState(false);
  const [questionUp, setQuestionUp] = useState(false);
  const [overlayGone, setOverlayGone] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.parse(initialStats.serverTime));
  const noticeTimer = useRef<number | null>(null);

  const flash = useCallback((message: string, ms = 7000) => {
    setNotice(message);
    if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), ms);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current !== null) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  /* ----------------------------------------------- boot: restore + clockwork */
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    const day = window.localStorage.getItem(DAY_KEY);
    const code = window.localStorage.getItem(COUNTRY_KEY);
    if (day === today && code) {
      const restored = describeCountry(code);
      if (restored.code !== "ZZ") {
        setRemembered(true);
        setYourCountry(restored);
        setOverlayGone(true);
        setSource("manual");
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
  const send = useCallback(
    async (countryCode?: string) => {
      setPending(true);
      setNotice(null);
      const previous = yourCountry;
      try {
        const response = await fetch("/api/remember", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(countryCode ? { countryCode } : {}),
        });
        const data = (await response.json()) as RememberResponse & { error?: string };
        if (!response.ok) throw new Error(data?.error ?? "network");

        if (data.stats) setStats(data.stats);
        if (data.country) {
          setYourCountry(data.country);
          setSource(data.source);
          window.localStorage.setItem(DAY_KEY, new Date().toISOString().slice(0, 10));
          window.localStorage.setItem(COUNTRY_KEY, data.country.code);
        }

        switch (data.mode) {
          case "corrected": {
            setPickerOpen(false);
            const fromName =
              previous && previous.code === data.replacedFrom
                ? previous.name
                : (stats.countries.find((row) => row.code === data.replacedFrom)?.name ??
                  data.replacedFrom);
            flash(
              fromName
                ? `Corrected — ${data.country?.emoji} ${data.country?.name} now holds your remembrance, and ${fromName} has been cleared. It is still counted once, not twice.`
                : `Corrected — ${data.country?.emoji} ${data.country?.name} now holds your remembrance.`,
              9000,
            );
            break;
          }
          case "recorded":
          case "remembered": {
            setPickerOpen(false);
            setRemembered(true);
            break;
          }
          case "already": {
            // They already said yes today (server-side day marker).
            setRemembered(true);
            if (!yourCountry) {
              setPickerOpen(true);
              flash("You already remembered her today. Tell us where from and it will be recorded as yours.");
            } else {
              setPickerOpen(false);
              flash("You have already remembered her today — the map already holds your light.");
            }
            break;
          }
          case "needs-country": {
            setPickerOpen(true);
            flash("Your network could not be placed. Pick your country and she will know where to look for you.");
            break;
          }
          case "throttled": {
            flash("One moment, please — that was a touch too fast.");
            break;
          }
          default: {
            flash(data.error ?? "The signal did not reach her. Try again in a moment.");
          }
        }
      } catch (error) {
        flash(
          error instanceof Error && error.message === "Unknown country code."
            ? "That country could not be read — pick one from the list."
            : "The signal did not reach her. Try again in a moment.",
        );
      } finally {
        setPending(false);
      }
    },
    [flash, yourCountry, stats.countries],
  );

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
        {/* ------------------------------------------------------- the stage */}
        <section className="mx-auto w-full max-w-7xl px-4 sm:px-8">
          {overlayGone ? (
            <h1 className="sr-only">Do you remember Machan? — Aston Machan Remembrance</h1>
          ) : null}

          <div className="relative flex flex-col gap-6 sm:block sm:gap-0">
            <div className="-mx-4 sm:mx-0">
              <div
                className="transition-all duration-[1400ms] ease-out"
                style={{
                  filter: remembered ? "blur(0px)" : "blur(2px) saturate(0.7)",
                  opacity: remembered ? 1 : 0.55,
                  transform: remembered ? "none" : "scale(0.985)",
                }}
              >
                <WorldMap stats={stats} yourCountry={yourCountry} awake={remembered} />
              </div>
            </div>

            {!overlayGone ? (
              <div
                className={`relative z-30 flex flex-col items-center px-1 py-4 text-center sm:absolute sm:inset-0 sm:rounded-3xl sm:py-0 ${
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
                      className="glow-text mt-6 max-w-3xl font-display text-[1.9rem] leading-[1.15] text-ink sm:mt-7 sm:text-5xl md:text-6xl"
                      aria-label={QUESTION}
                    >
                      <Reveal text={QUESTION} base={420} />
                    </h1>

                    <div
                      className="animate-fade-up relative mt-9 sm:mt-11"
                      style={{ animationDelay: "1250ms" }}
                    >
                      <span className="halo" />
                      <span className="halo halo-2" />
                      <button
                        type="button"
                        onClick={() => void send()}
                        disabled={pending}
                        aria-label="Yes, I remember Machan"
                        className="remember-btn disabled:cursor-wait disabled:opacity-70"
                      >
                        {pending ? "Remembering…" : "Yes"}
                      </button>
                    </div>

                    <p
                      className="animate-fade-up mt-8 max-w-md text-[11px] leading-relaxed text-mist/75"
                      style={{ animationDelay: "1500ms" }}
                    >
                      Pressing yes uses your IP address once, to brighten the country you are
                      remembering Machan from.
                      <strong className="text-ink/80">
                        {" "}
                        It is never logged or stored — not even a hash of it.
                      </strong>
                    </p>

                    <button
                      type="button"
                      onClick={() => setPickerOpen((open) => !open)}
                      className="animate-fade-up mt-5 text-[11px] uppercase tracking-[0.22em] text-mist/70 underline decoration-dotted underline-offset-4 transition hover:text-gold"
                      style={{ animationDelay: "1650ms" }}
                    >
                      IP wrong? Choose your country instead
                    </button>
                  </>
                ) : null}

                {notice ? (
                  <p className="mt-5 max-w-md text-xs leading-relaxed text-tide">{notice}</p>
                ) : null}
                {pickerOpen ? <CountryPicker onPick={(code) => void send(code)} /> : null}
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
                    remembering from there
                    {source === "manual" ? (
                      <span className="text-mist/70"> · you told us, not your IP</span>
                    ) : null}
                    .
                  </>
                ) : (
                  <>Your remembrance was counted, though we could not place it on the map.</>
                )}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setPickerOpen((open) => !open)}
                  className="rounded-full border border-gold/30 bg-gold/[0.06] px-5 py-2 text-[10px] uppercase tracking-[0.28em] text-gold transition hover:border-gold/60 hover:bg-gold/10"
                >
                  Wrong country? Fix it
                </button>
                <button
                  type="button"
                  onClick={() => void share()}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-5 py-2 text-[10px] uppercase tracking-[0.28em] text-mist transition hover:border-gold/40 hover:text-ink"
                >
                  Share this
                </button>
                {shareNote ? <span className="text-[11px] text-tide">{shareNote}</span> : null}
              </div>

              {pickerOpen ? (
                <div className="flex w-full flex-col items-center gap-3">
                  <p className="max-w-md text-[11px] leading-relaxed text-mist/80">
                    {yourCountry
                      ? `Your ${yourCountry.emoji} ${yourCountry.name} remembrance will be moved, not duplicated — the old record is removed and the one you pick is added.`
                      : "Pick the country you are remembering Machan from."}
                  </p>
                  {pending ? (
                    <p className="text-[11px] uppercase tracking-[0.24em] text-gold">
                      correcting…
                    </p>
                  ) : null}
                  <CountryPicker onPick={(code) => void send(code)} />
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
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (window.matchMedia?.("(hover: hover) and (pointer: fine)").matches) {
      inputRef.current?.focus();
    }
  }, []);

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

  const needle = query.trim().toLowerCase();
  const filtered = (needle ? countries.filter((c) => c.name.toLowerCase().includes(needle)) : countries
  ).slice(0, 80);

  return (
    <div className="card animate-fade-up mt-1 w-full max-w-md p-4 text-left">
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 focus-within:border-gold/40">
        <svg
          className="h-3.5 w-3.5 shrink-0 text-mist/60"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-4.3-4.3" strokeLinecap="round" />
        </svg>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search your country…"
          aria-label="Search for your country"
          className="w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-mist/50"
        />
      </div>
      <div className="mt-3 grid max-h-52 grid-cols-1 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
        {filtered.map((country) => (
          <button
            key={country.code}
            type="button"
            onClick={() => onPick(country.code)}
            className="truncate rounded-md px-2 py-2 text-left text-xs text-mist transition hover:bg-white/5 hover:text-ink active:bg-gold/10"
          >
            {country.emoji} {country.name}
          </button>
        ))}
        {countries.length === 0 ? (
          <p className="col-span-full py-4 text-center text-xs text-mist/60">Loading…</p>
        ) : null}
        {countries.length > 0 && filtered.length === 0 ? (
          <p className="col-span-full py-4 text-center text-xs text-mist/60">
            No country matches “{query}”.
          </p>
        ) : null}
      </div>
    </div>
  );
}

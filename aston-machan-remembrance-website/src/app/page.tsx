import Experience from "@/components/Experience";
import { HerStory, PrivacyNote } from "@/components/Sections";
import { getStats, emptyStats, type StatsPayload } from "@/lib/stats";

export const dynamic = "force-dynamic";

function Backdrop() {
  return (
    <div className="backdrop" aria-hidden="true">
      <span className="aurora aurora-a" />
      <span className="aurora aurora-b" />
      <span className="aurora aurora-c" />
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-5 text-center sm:px-8">
        <p className="font-display text-lg text-ink/80">She is looking at the camera. Look back.</p>
        <nav className="flex items-center gap-6 text-[10px] uppercase tracking-[0.3em] text-mist/60">
          <a className="transition hover:text-gold" href="#story">
            Her story
          </a>
          <a className="transition hover:text-gold" href="#privacy">
            Privacy
          </a>
          <a className="transition hover:text-gold" href="/api/stats">
            Open data
          </a>
        </nav>
        <p className="max-w-xl text-[11px] leading-relaxed text-mist/50">
          Aston Machan · 2004 — 21 April 2008. Counters for today, this week and this month roll
          back to zero at 00:00 UTC on their own schedule. No IP addresses are stored, hashed or
          logged — only countries and timestamps.
        </p>
      </div>
    </footer>
  );
}

export default async function Page() {
  let stats: StatsPayload;
  try {
    stats = await getStats();
  } catch {
    stats = emptyStats();
  }

  return (
    <>
      <Backdrop />
      <Experience initialStats={stats} />
      <HerStory />
      <PrivacyNote />
      <Footer />
    </>
  );
}

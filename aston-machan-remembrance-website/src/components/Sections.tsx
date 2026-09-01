import { Ribbon } from "@/components/Emblems";

const TIMELINE = [
  {
    year: "2004",
    title: "A foal in Japan",
    body: "Aston Machan is born. She would grow into a filly fast enough, and brave enough, to run against the best of her generation.",
  },
  {
    year: "2007",
    title: "Sprinters Stakes",
    body: "On 30 September 2007 she takes the Sprinters Stakes, beating a field of the country's fastest sprinters. It is the peak of a career that should have had many more chapters.",
  },
  {
    year: "2008",
    title: "21 April",
    body: "At four years old she dies of colitis X — sudden, cruel, and far too early. With Daiwa Scarlet and Vodka still dominating the headlines, her story quietly slips out of the record.",
  },
  {
    year: "Today",
    title: "The wish",
    body: "Her owner, Mayumi Tosa, reached out so that her horse would never be forgotten. That request became a character whose only goal is to be remembered — who wears a crown so you will look, and a ribbon so you will stay tied together.",
  },
];

export function HerStory() {
  return (
    <section id="story" className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8">
      <div className="flex flex-col items-center text-center">
        <Ribbon className="h-3.5 w-28" />
        <h2 className="mt-6 font-display text-3xl text-ink sm:text-4xl">Her story</h2>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-mist">
          She was real. She ran, she won, and she was gone before anyone thought to keep looking.
          This page exists so that the looking never stops.
        </p>
      </div>

      <ol className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {TIMELINE.map((entry, index) => (
          <li
            key={entry.year}
            className="card animate-fade-up p-6"
            style={{ animationDelay: `${index * 130}ms` }}
          >
            <div className="font-display text-3xl text-gold/90">{entry.year}</div>
            <div className="gold-rule my-4" />
            <h3 className="text-sm uppercase tracking-[0.2em] text-ink/90">{entry.title}</h3>
            <p className="mt-3 text-sm leading-relaxed text-mist">{entry.body}</p>
          </li>
        ))}
      </ol>

      <figure className="mx-auto mt-16 max-w-3xl text-center">
        <blockquote className="font-display text-2xl leading-relaxed text-ink/90 italic sm:text-3xl">
          “She wears a crown so that you will remember her, and a ribbon so that everyone who
          remembers her stays tied together.”
        </blockquote>
        <figcaption className="mt-6 text-[10px] uppercase tracking-[0.32em] text-mist/70">
          When her banner comes — never forget her
        </figcaption>
      </figure>
    </section>
  );
}

export function PrivacyNote() {
  return (
    <section id="privacy" className="mx-auto w-full max-w-3xl px-5 pb-24 sm:px-8">
      <div className="card p-7 sm:p-9">
        <h2 className="font-display text-2xl text-ink">What happens when you press Yes</h2>
        <div className="gold-rule my-5" />
        <ul className="space-y-4 text-sm leading-relaxed text-mist">
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
            <span>
              Your IP address is read once, in the moment you press the button, to work out{" "}
              <strong className="text-ink/90">which country</strong> you are remembering Machan
              from.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-tide/80" />
            <span>
              <strong className="text-ink/90">The IP address is never logged, never written to
              the database, and never hashed or stored.</strong>{" "}
              Only the country name and the timestamp of the remembrance are kept.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ember/80" />
            <span>
              Transient lookups are keyed by a randomly-salted hash that is thrown away when this
              server restarts, so nothing about you can be reconstructed later.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-gold/80" />
            <span>
              No accounts, no cookies for tracking, no third-party analytics. A single anonymous
              day-marker keeps your browser from counting twice on the same day.
            </span>
          </li>
          <li className="flex gap-3">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-tide/80" />
            <span>
              <strong className="text-ink/90">Location correction:</strong> If your IP was inaccurate (e.g. VPN or network routing), you can tap any country or use &ldquo;Correct my country&rdquo; at any time. The previous record from your IP is deleted, and your chosen country is saved in its place.
            </span>
          </li>
        </ul>
      </div>
    </section>
  );
}

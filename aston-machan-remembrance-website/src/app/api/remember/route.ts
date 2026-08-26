import { cookies } from "next/headers";
import { describeCountry } from "@/lib/countries";
import { isThrottled, resolveCountryFromRequest } from "@/lib/geo";
import { startOfUtcDay } from "@/lib/periods";
import { getStats, recordRemembrance, type StatsPayload } from "@/lib/stats";

export const dynamic = "force-dynamic";

const COOKIE_DAY = "machan_remembered_day";
const FORTY_EIGHT_HOURS = 60 * 60 * 48;

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const today = dayKey(new Date());
  const rememberedToday = cookieStore.get(COOKIE_DAY)?.value === today;

  let country = describeCountry(null);
  let source: "edge" | "ip" | "unknown" | "manual" = "unknown";
  let counted = false;
  /** True when the network could not be placed: nothing is written until they tell us. */
  let needsCountry = false;

  if (rememberedToday) {
    counted = false;
  } else {
    // The IP is inspected here and only here, then discarded.
    const detected = await resolveCountryFromRequest(request.headers);
    country = detected.country;
    source = detected.source;

    if (source === "unknown") {
      const body = (await request.json().catch(() => null)) as { countryCode?: unknown } | null;
      const picked = describeCountry(typeof body?.countryCode === "string" ? body.countryCode : "");
      if (picked.code !== "ZZ") {
        country = picked;
        source = "manual";
      }
    }

    if (country.code === "ZZ") {
      needsCountry = true;
    } else {
      counted = !isThrottled(request.headers);
      if (counted) {
        await recordRemembrance(country);
      }
      cookieStore.set(COOKIE_DAY, today, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: FORTY_EIGHT_HOURS,
        secure: process.env.NODE_ENV === "production",
      });
    }
  }

  const stats: StatsPayload = await getStats();

  return Response.json(
    { counted, rememberedToday, needsCountry, country, source, stats },
    { headers: { "cache-control": "no-store" } },
  );
}

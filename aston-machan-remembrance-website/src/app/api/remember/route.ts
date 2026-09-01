import { cookies } from "next/headers";
import { describeCountry } from "@/lib/countries";
import { isThrottled, resolveCountryFromRequest } from "@/lib/geo";
import { startOfUtcDay } from "@/lib/periods";
import { getStats, recordRemembrance, replaceRemembrance, type StatsPayload } from "@/lib/stats";

export const dynamic = "force-dynamic";

const COOKIE_DAY = "machan_remembered_day";
const COOKIE_ID = "machan_remembrance_id";
const FORTY_EIGHT_HOURS = 60 * 60 * 48;

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const today = dayKey(new Date());
  const rememberedToday = cookieStore.get(COOKIE_DAY)?.value === today;
  const cookieRemembranceId = Number(cookieStore.get(COOKIE_ID)?.value) || null;

  const body = (await request.json().catch(() => null)) as {
    countryCode?: unknown;
    previousId?: unknown;
  } | null;

  const parsedCountryCode =
    typeof body?.countryCode === "string" ? body.countryCode.trim() : "";
  const previousId =
    typeof body?.previousId === "number" && body.previousId > 0
      ? body.previousId
      : cookieRemembranceId;

  let country = describeCountry(null);
  let source: "edge" | "ip" | "unknown" | "manual" = "unknown";
  let counted = false;
  let updated = false;
  let needsCountry = false;
  let newRemembranceId: number | null = previousId;

  // Case 1: The user is explicitly correcting / changing their country
  if (parsedCountryCode) {
    const picked = describeCountry(parsedCountryCode);
    if (picked.code !== "ZZ") {
      country = picked;
      source = "manual";
      // Replace: delete previous record (if any) and insert the new chosen country
      newRemembranceId = await replaceRemembrance(previousId, picked);
      counted = true;
      updated = Boolean(previousId);

      cookieStore.set(COOKIE_DAY, today, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: FORTY_EIGHT_HOURS,
        secure: process.env.NODE_ENV === "production",
      });
      if (newRemembranceId) {
        cookieStore.set(COOKIE_ID, String(newRemembranceId), {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: FORTY_EIGHT_HOURS,
          secure: process.env.NODE_ENV === "production",
        });
      }
    } else {
      needsCountry = true;
    }
  } else if (rememberedToday && previousId) {
    // Already remembered today and didn't provide a country to correct to
    counted = false;
  } else {
    // Case 2: First-time remember via IP lookup
    const detected = await resolveCountryFromRequest(request.headers);
    country = detected.country;
    source = detected.source;

    if (country.code === "ZZ") {
      needsCountry = true;
    } else {
      counted = !isThrottled(request.headers);
      if (counted) {
        newRemembranceId = await recordRemembrance(country);
      }
      cookieStore.set(COOKIE_DAY, today, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: FORTY_EIGHT_HOURS,
        secure: process.env.NODE_ENV === "production",
      });
      if (newRemembranceId) {
        cookieStore.set(COOKIE_ID, String(newRemembranceId), {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          maxAge: FORTY_EIGHT_HOURS,
          secure: process.env.NODE_ENV === "production",
        });
      }
    }
  }

  const stats: StatsPayload = await getStats();

  return Response.json(
    {
      counted,
      updated,
      rememberedToday: true,
      needsCountry,
      country,
      source,
      remembranceId: newRemembranceId,
      stats,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

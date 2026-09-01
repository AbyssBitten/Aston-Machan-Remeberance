import { cookies } from "next/headers";
import { describeCountry } from "@/lib/countries";
import { isThrottled, resolveCountryFromRequest } from "@/lib/geo";
import { startOfUtcDay } from "@/lib/periods";
import {
  getRemembranceCountry,
  getStats,
  recordRemembrance,
  replaceRemembrance,
  type StatsPayload,
} from "@/lib/stats";

export const dynamic = "force-dynamic";

const COOKIE_DAY = "machan_remembered_day";
const COOKIE_ID = "machan_remembrance_id";
const TWO_DAYS = 60 * 60 * 48;

type Source = "edge" | "ip" | "unknown" | "manual";

function dayKey(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/** Cookies must only be marked Secure when the request really is https. */
function isSecure(request: Request): boolean {
  const proto = request.headers.get("x-forwarded-proto");
  if (proto) return proto.split(",")[0]?.trim() === "https";
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const now = new Date();
  const dayStart = startOfUtcDay(now);
  const today = dayKey(now);
  const secure = isSecure(request);

  const rememberedToday = cookieStore.get(COOKIE_DAY)?.value === today;

  /**
   * SECURITY: the id of the visitor's own remembrance is read ONLY from their
   * httpOnly cookie — never from the request body. A crafted payload therefore
   * cannot delete somebody else's record. It is also ignored unless the day
   * marker says the record belongs to today.
   */
  const previousId = rememberedToday
    ? Number(cookieStore.get(COOKIE_ID)?.value) || null
    : null;

  const body = (await request.json().catch(() => null)) as { countryCode?: unknown } | null;
  const requestedCode = typeof body?.countryCode === "string" ? body.countryCode.trim() : "";

  const remember = (id: number) => {
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      path: "/",
      maxAge: TWO_DAYS,
      secure,
    };
    cookieStore.set(COOKIE_DAY, today, options);
    if (id > 0) cookieStore.set(COOKIE_ID, String(id), options);
  };

  let country = describeCountry(null);
  let source: Source = "unknown";
  let counted = false;
  let updated = false;
  let needsCountry = false;
  let remembranceId = previousId;

  if (requestedCode) {
    /* ---- the visitor is telling us where they actually are -------------- */
    const picked = describeCountry(requestedCode);
    if (picked.code === "ZZ") {
      needsCountry = true;
    } else {
      const result = await replaceRemembrance(previousId, picked, dayStart);
      country = picked;
      source = "manual";
      counted = true;
      updated = result.replaced;
      remembranceId = result.id;
      remember(result.id);
    }
  } else if (rememberedToday && previousId) {
    /* ---- already counted today: report back what we hold ---------------- */
    const existing = await getRemembranceCountry(previousId, dayStart);
    if (existing) {
      country = existing;
      source = "manual";
    }
  } else {
    /* ---- first press of Yes: resolve the country from the IP, once ------ */
    const detected = await resolveCountryFromRequest(request.headers);
    country = detected.country;
    source = detected.source;

    if (country.code === "ZZ") {
      needsCountry = true;
    } else if (isThrottled(request.headers)) {
      counted = false;
    } else {
      const id = await recordRemembrance(country);
      counted = true;
      remembranceId = id;
      remember(id);
    }
  }

  const stats: StatsPayload = await getStats();

  return Response.json(
    {
      counted,
      updated,
      rememberedToday: rememberedToday || counted,
      needsCountry,
      country,
      source,
      remembranceId,
      stats,
    },
    { headers: { "cache-control": "no-store" } },
  );
}

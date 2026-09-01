import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { remembrances } from "@/db/schema";
import { periodWindows, type PeriodKey } from "@/lib/periods";
import type { DescribedCountry } from "@/lib/countries";

export type CountryTally = {
  code: string;
  name: string;
  region: string;
  emoji: string;
  count: number;
  today: number;
  week: number;
};

export type RecentRemembrance = {
  id: number;
  code: string;
  name: string;
  region: string;
  emoji: string;
  at: string;
};

export type StatsPayload = {
  today: number;
  week: number;
  month: number;
  total: number;
  countries: CountryTally[];
  recent: RecentRemembrance[];
  /** ISO instants at which each counter rolls back to zero. */
  resets: Record<PeriodKey, string>;
  serverTime: string;
};

export async function getStats(): Promise<StatsPayload> {
  const now = new Date();
  const windows = periodWindows(now);

  const [totals] = await db
    .select({
      total: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${remembrances.rememberedAt} >= ${windows.day.start})::int`,
      week: sql<number>`count(*) filter (where ${remembrances.rememberedAt} >= ${windows.week.start})::int`,
      month: sql<number>`count(*) filter (where ${remembrances.rememberedAt} >= ${windows.month.start})::int`,
    })
    .from(remembrances);

  const tallyRows = await db
    .select({
      code: remembrances.countryCode,
      name: remembrances.countryName,
      region: remembrances.region,
      emoji: remembrances.flag,
      count: sql<number>`count(*)::int`,
      today: sql<number>`count(*) filter (where ${remembrances.rememberedAt} >= ${windows.day.start})::int`,
      week: sql<number>`count(*) filter (where ${remembrances.rememberedAt} >= ${windows.week.start})::int`,
    })
    .from(remembrances)
    .groupBy(
      remembrances.countryCode,
      remembrances.countryName,
      remembrances.region,
      remembrances.flag,
    )
    .orderBy(desc(sql`count(*)`));

  const recentRows = await db
    .select({
      id: remembrances.id,
      code: remembrances.countryCode,
      name: remembrances.countryName,
      region: remembrances.region,
      emoji: remembrances.flag,
      at: remembrances.rememberedAt,
    })
    .from(remembrances)
    .orderBy(desc(remembrances.rememberedAt), desc(remembrances.id))
    .limit(16);

  return {
    today: Number(totals?.today ?? 0),
    week: Number(totals?.week ?? 0),
    month: Number(totals?.month ?? 0),
    total: Number(totals?.total ?? 0),
    countries: tallyRows.map((row) => ({
      code: row.code,
      name: row.name,
      region: row.region,
      emoji: row.emoji,
      count: Number(row.count),
      today: Number(row.today),
      week: Number(row.week),
    })),
    recent: recentRows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      region: row.region,
      emoji: row.emoji,
      at: new Date(row.at).toISOString(),
    })),
    resets: {
      day: windows.day.end.toISOString(),
      week: windows.week.end.toISOString(),
      month: windows.month.end.toISOString(),
    },
    serverTime: now.toISOString(),
  };
}

/** Used when the database is unreachable — the page still renders, quietly. */
export function emptyStats(): StatsPayload {
  const windows = periodWindows(new Date());
  return {
    today: 0,
    week: 0,
    month: 0,
    total: 0,
    countries: [],
    recent: [],
    resets: {
      day: windows.day.end.toISOString(),
      week: windows.week.end.toISOString(),
      month: windows.month.end.toISOString(),
    },
    serverTime: new Date().toISOString(),
  };
}

export async function recordRemembrance(country: DescribedCountry): Promise<number> {
  const [row] = await db
    .insert(remembrances)
    .values({
      countryCode: country.code,
      countryName: country.name,
      region: country.region,
      flag: country.emoji,
      precision: country.precision,
    })
    .returning({ id: remembrances.id });
  return row?.id ?? 0;
}

/**
 * Replaces a visitor's previous remembrance with their chosen country.
 * The previous record (taken from IP or previous choice) is deleted from the
 * database, and the new country record is inserted instead.
 */
export async function replaceRemembrance(
  previousId: number | null | undefined,
  newCountry: DescribedCountry,
): Promise<number> {
  if (previousId && Number.isInteger(previousId) && previousId > 0) {
    await db.delete(remembrances).where(eq(remembrances.id, previousId));
  }
  return await recordRemembrance(newCountry);
}

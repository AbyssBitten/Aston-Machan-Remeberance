import meta from "@/data/countries-meta.json";

export type CountryMeta = { name: string; region: string; emoji: string };

export const COUNTRY_META = meta as Record<string, CountryMeta>;

export type DescribedCountry = {
  code: string;
  name: string;
  region: string;
  emoji: string;
  /** 1 = resolved from the visitor's network, 0 = chosen manually / unknown. */
  precision: number;
};

export const UNKNOWN_COUNTRY: DescribedCountry = {
  code: "ZZ",
  name: "Somewhere on Earth",
  region: "Unknown",
  emoji: "🌍",
  precision: 0,
};

export function describeCountry(code?: string | null): DescribedCountry {
  if (!code) return UNKNOWN_COUNTRY;
  const normalized = code.trim().toUpperCase();
  if (normalized === "ZZ") return UNKNOWN_COUNTRY;
  const found = COUNTRY_META[normalized];
  if (!found) {
    return {
      code: normalized.slice(0, 8),
      name: normalized,
      region: "",
      emoji: "",
      precision: 0,
    };
  }
  return {
    code: normalized,
    name: found.name,
    region: found.region,
    emoji: found.emoji,
    precision: 1,
  };
}

/** Every country, sorted for the manual picker fallback. */
export const ALL_COUNTRIES = Object.entries(COUNTRY_META)
  .map(([code, value]) => ({ code, ...value }))
  .sort((a, b) => a.name.localeCompare(b.name));

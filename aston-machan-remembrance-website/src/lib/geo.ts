import { createHash, randomBytes } from "node:crypto";
import { describeCountry, UNKNOWN_COUNTRY, type DescribedCountry } from "@/lib/countries";

/**
 * PRIVACY CONTRACT
 * ----------------
 * The visitor's IP address is read to answer exactly one question: "which country
 * is this remembrance coming from?" It is:
 *   - never written to the database (only country + timestamp are stored),
 *   - never written to any log line,
 *   - never kept in memory in plaintext (cache + rate-limit keys use a
 *     per-process random salt hash, so nothing survives a restart or is
 *     linkable across processes).
 */

const SALT = randomBytes(16).toString("hex");

/** Non-reversible, per-process key. Two processes hash the same IP differently. */
function hashKey(value: string): string {
  return createHash("sha256").update(`${SALT}:${value}`).digest("hex").slice(0, 32);
}

type CacheEntry = { value: DescribedCountry; expires: number };
const geoCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 5_000;

/** Throttle keys hold nothing but a salted hash and a timestamp. */
const throttle = new Map<string, number>();
const THROTTLE_MS = 30_000;
const THROTTLE_MAX = 5_000;

const PRIVATE_PATTERNS = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^::1$/,
  /^fc00:/i,
  /^fd[0-9a-f]{2}:/i,
  /^fe80:/i,
  /^localhost$/i,
];

export function isPrivateAddress(ip: string): boolean {
  if (!ip) return true;
  return PRIVATE_PATTERNS.some((pattern) => pattern.test(ip));
}

export function extractIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("x-real-ip") ??
    headers.get("cf-connecting-ip")?.trim() ??
    headers.get("x-client-ip")?.trim() ??
    ""
  );
}

export function throttleKey(headers: Headers): string {
  return hashKey(extractIp(headers) || headers.get("user-agent") || "anonymous");
}

/** Returns true when this visitor is remembered as "already just now". */
export function isThrottled(headers: Headers): boolean {
  const key = throttleKey(headers);
  const last = throttle.get(key);
  const now = Date.now();
  if (last && now - last < THROTTLE_MS) return true;
  if (throttle.size > THROTTLE_MAX) throttle.clear();
  throttle.set(key, now);
  return false;
}

function cacheSet(key: string, value: DescribedCountry) {
  if (geoCache.size > CACHE_MAX) geoCache.clear();
  geoCache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
}

async function fetchJson(url: string, timeoutMs = 2_500): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
      headers: { accept: "application/json", "user-agent": "aston-machan-remembrance/1.0" },
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const str = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/**
 * Resolves a country from an IP address using whichever provider is available.
 * Only the resulting country descriptor is returned — the IP is dropped here.
 */
async function resolveIp(ip: string): Promise<DescribedCountry | null> {
  if (!ip || isPrivateAddress(ip)) return null;

  const token = process.env.IPINFO_TOKEN;
  if (token) {
    const data = await fetchJson(`https://ipinfo.io/${encodeURIComponent(ip)}/json?token=${token}`);
    const code = str(data?.country).toUpperCase();
    if (code.length === 2) return describeCountry(code);
  }

  const ipwhois = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
  if (ipwhois && ipwhois.success !== false) {
    const code = str(ipwhois.country_code).toUpperCase();
    if (code.length === 2) return describeCountry(code);
  }

  const ipapi = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
  const ipapiCode = str(ipapi?.country_code).toUpperCase();
  if (ipapiCode.length === 2) return describeCountry(ipapiCode);

  return null;
}

/**
 * Order of resolution:
 *  1. Edge/CDN geo headers (instant, no third-party call, no IP leaves the box)
 *  2. IP geolocation provider, if the address is public
 *  3. Unknown — the visitor may pick their country manually
 */
export async function resolveCountryFromRequest(headers: Headers): Promise<{
  country: DescribedCountry;
  source: "edge" | "ip" | "unknown";
}> {
  const edge =
    headers.get("cf-ipcountry") ??
    headers.get("x-vercel-ip-country") ??
    headers.get("x-geo-country") ??
    headers.get("x-country-code");

  if (edge && /^[a-zA-Z]{2}$/.test(edge)) {
    return { country: describeCountry(edge), source: "edge" };
  }

  const ip = extractIp(headers);
  if (!ip || isPrivateAddress(ip)) {
    return { country: UNKNOWN_COUNTRY, source: "unknown" };
  }

  const key = hashKey(ip);
  const cached = geoCache.get(key);
  if (cached && cached.expires > Date.now()) {
    return { country: cached.value, source: cached.value.code === UNKNOWN_COUNTRY.code ? "unknown" : "ip" };
  }

  const resolved = await resolveIp(ip);
  const value = resolved ?? UNKNOWN_COUNTRY;
  cacheSet(key, value);
  return { country: value, source: resolved ? "ip" : "unknown" };
}

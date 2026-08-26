/**
 * Generates src/data/world-map.json — a pre-projected, vector-accurate world map
 * (Natural Earth geometry via world-atlas) so the client bundle needs no geo libs.
 *
 * Run: node scripts/build-world.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { geoEquirectangular, geoPath, geoGraticule10 } from "d3-geo";
import { feature } from "topojson-client";

const WIDTH = 1000;
const HEIGHT = 500;

const topo = JSON.parse(
  readFileSync(new URL("../node_modules/world-atlas/countries-110m.json", import.meta.url), "utf8"),
);
const meta = JSON.parse(
  readFileSync(new URL("../node_modules/world-countries/dist/countries.json", import.meta.url), "utf8"),
);

const byCcn3 = new Map(meta.map((c) => [c.ccn3, c]));
const byName = new Map(meta.map((c) => [c.name.common.toLowerCase(), c]));

const collection = feature(topo, topo.objects.countries);

const projection = geoEquirectangular().fitExtent(
  [
    [6, 6],
    [WIDTH - 6, HEIGHT - 6],
  ],
  collection,
);
const path = geoPath(projection);

/** Round every coordinate in an SVG path string to 1 decimal to keep it light. */
function compact(d) {
  return d.replace(/-?\d+\.\d+/g, (n) => {
    const v = Number(n);
    return String(Math.abs(v) < 0.05 ? 0 : Math.round(v * 10) / 10);
  });
}

const countries = [];

for (const f of collection.features) {
  const d = path(f);
  if (!d) continue;
  const numericId = String(f.id ?? "").padStart(3, "0");
  const earthName = f.properties?.name ?? "Unknown";
  const m = byCcn3.get(numericId) ?? byName.get(earthName.toLowerCase());
  const code = m?.cca2 ?? "";
  const center = path.centroid(f);
  const [[x0, y0], [x1, y1]] = path.bounds(f);

  countries.push({
    code: code || `X${numericId}`,
    name: m?.name?.common ?? earthName,
    region: m?.region ?? "",
    emoji: m?.flag ?? "",
    d: compact(d),
    cx: Math.round(center[0] * 10) / 10,
    cy: Math.round(center[1] * 10) / 10,
    bw: Math.round((x1 - x0) * 10) / 10,
    bh: Math.round((y1 - y0) * 10) / 10,
  });
}

countries.sort((a, b) => a.name.localeCompare(b.name));

const graticule = compact(path(geoGraticule10()) ?? "");
const sphere = compact(path({ type: "Sphere" }) ?? "");

/** Full ISO-3166 index so remembrances from micro-states still resolve by name. */
const metaIndex = {};
for (const c of meta) {
  metaIndex[c.cca2] = {
    name: c.name?.common ?? c.cca2,
    region: c.region ?? "",
    emoji: c.flag ?? "",
  };
}

mkdirSync(new URL("../src/data/", import.meta.url), { recursive: true });
writeFileSync(
  new URL("../src/data/countries-meta.json", import.meta.url),
  JSON.stringify(metaIndex),
);
writeFileSync(
  new URL("../src/data/world-map.json", import.meta.url),
  JSON.stringify({ width: WIDTH, height: HEIGHT, graticule, sphere, countries }),
);

console.log(`world-map.json written: ${countries.length} countries`);

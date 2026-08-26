import { ALL_COUNTRIES } from "@/lib/countries";

export async function GET() {
  return Response.json(
    {
      countries: ALL_COUNTRIES.map((country) => ({
        code: country.code,
        name: country.name,
        emoji: country.emoji,
      })),
    },
    { headers: { "cache-control": "public, max-age=86400" } },
  );
}

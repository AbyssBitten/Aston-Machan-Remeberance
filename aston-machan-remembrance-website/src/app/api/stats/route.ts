import { getStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await getStats();
  return Response.json({ stats }, { headers: { "cache-control": "no-store" } });
}

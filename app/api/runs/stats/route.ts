import { NextResponse } from "next/server";
import { getAllUserRuns } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { computeStats } from "@/lib/analytics";

/**
 * GET /api/runs/stats
 * Aggregated analytics for the signed-in user: success rate, latency,
 * tokens, estimated cost, daily series, and per-model breakdowns.
 */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const runs = await getAllUserRuns(user.id);
    const stats = computeStats(runs);
    return NextResponse.json(stats);
  } catch (error) {
    console.error("Error computing run stats:", error);
    return NextResponse.json({ error: "Failed to compute stats" }, { status: 500 });
  }
}
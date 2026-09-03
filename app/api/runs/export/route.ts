import { NextRequest, NextResponse } from "next/server";
import { getAllUserRuns } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { runsToCsv } from "@/lib/analytics";

/**
 * GET /api/runs/export?status=completed
 * Downloads the signed-in user's run history as CSV.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const status = request.nextUrl.searchParams.get("status");

  try {
    const runs = await getAllUserRuns(user.id);
    const filtered =
      status && status !== "all"
        ? runs.filter((r) => r.status === status)
        : runs;

    const csv = runsToCsv(filtered);
    const date = new Date().toISOString().slice(0, 10);

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agentboard-runs-${date}.csv"`,
      },
    });
  } catch (error) {
    console.error("Error exporting runs:", error);
    return NextResponse.json({ error: "Failed to export runs" }, { status: 500 });
  }
}
import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { listAlertEvents } from "@/lib/alerts";

/**
 * GET /api/settings/alert-events?limit=50
 * Recent fired alerts for the signed-in user.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;

  try {
    const events = await listAlertEvents(user.id, limit);
    return NextResponse.json({ events });
  } catch (error) {
    console.error("Error listing alert events:", error);
    return NextResponse.json({ error: "Failed to list alert events" }, { status: 500 });
  }
}
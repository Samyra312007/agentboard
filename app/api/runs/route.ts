import { NextRequest, NextResponse } from "next/server";
import { getAllRuns, getRunWithSteps } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // Get single run with steps
      const run = await getRunWithSteps(id);
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      return NextResponse.json(run);
    } else {
      // Get all runs
      const runs = await getAllRuns();
      return NextResponse.json({ runs });
    }
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}

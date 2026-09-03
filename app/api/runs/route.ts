import { NextRequest, NextResponse } from "next/server";
import { getAllRuns, getRunWithSteps } from "@/lib/db";
import { parsePagination, validateRunId } from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    if (id) {
      // Get single run with steps
      const runId = validateRunId(id);
      if (!runId.ok) {
        return NextResponse.json({ error: runId.error }, { status: 400 });
      }
      const run = await getRunWithSteps(runId.value);
      if (!run) {
        return NextResponse.json({ error: "Run not found" }, { status: 404 });
      }
      return NextResponse.json(run);
    }

    // Get all runs with pagination + optional status filter
    const { limit, offset, status } = parsePagination(searchParams);
    const { runs, total } = await getAllRuns({ limit, offset, status });
    return NextResponse.json({ runs, total, limit, offset });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json({ error: "Failed to fetch runs" }, { status: 500 });
  }
}
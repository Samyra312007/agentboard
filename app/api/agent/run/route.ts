import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { createRun } from "@/lib/db";
import type { CreateRunRequest } from "@/types";

export async function POST(request: NextRequest) {
  try {
    const body: CreateRunRequest = await request.json();

    if (!body.task || typeof body.task !== "string") {
      return NextResponse.json(
        { error: "Invalid task: must be a non-empty string" },
        { status: 400 }
      );
    }

    const run = createRun({
      id: uuidv4(),
      task: body.task,
      model: body.model || "llama-3.1-70b-versatile",
      max_steps: body.maxSteps || 10,
      final_output: null,
      error_message: null,
      created_at: new Date().toISOString(),
      completed_at: null,
    });

    return NextResponse.json({
      run_id: run.id,
      status: "started",
    });
  } catch (error) {
    console.error("Error creating run:", error);
    return NextResponse.json(
      { error: "Failed to create run" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createAlertRule, deleteAlertRule, listAlertRules } from "@/lib/alerts";
import { validateAlertRule, validateRunId } from "@/lib/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rules = await listAlertRules(user.id);
    return NextResponse.json({ rules });
  } catch (error) {
    console.error("Error listing alert rules:", error);
    return NextResponse.json({ error: "Failed to list alert rules" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON" }, { status: 400 });
  }

  const validation = validateAlertRule(body);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  try {
    const rule = await createAlertRule(user.id, validation.value);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (error) {
    console.error("Error creating alert rule:", error);
    return NextResponse.json({ error: "Failed to create alert rule" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const ruleId = validateRunId(id ?? "");
  if (!ruleId.ok) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  try {
    await deleteAlertRule(ruleId.value, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting alert rule:", error);
    return NextResponse.json({ error: "Failed to delete alert rule" }, { status: 500 });
  }
}
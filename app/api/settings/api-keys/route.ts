import { NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { createApiKey, deleteApiKey, listApiKeys } from "@/lib/api-keys";
import { validateApiKeyName, validateRunId } from "@/lib/validation";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const keys = await listApiKeys(user.id);
    return NextResponse.json({ keys });
  } catch (error) {
    console.error("Error listing API keys:", error);
    return NextResponse.json({ error: "Failed to list API keys" }, { status: 500 });
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

  const name = validateApiKeyName((body as Record<string, unknown> | null)?.name);
  if (!name.ok) {
    return NextResponse.json({ error: name.error }, { status: 400 });
  }

  try {
    const key = await createApiKey(user.id, name.value);
    return NextResponse.json(
      {
        id: key.id,
        name: name.value,
        prefix: key.prefix,
        // Raw key is returned exactly once — it cannot be retrieved again.
        key: key.raw,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating API key:", error);
    return NextResponse.json({ error: "Failed to create API key" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = request.nextUrl.searchParams.get("id");
  const keyId = validateRunId(id ?? "");
  if (!keyId.ok) {
    return NextResponse.json({ error: "id must be a valid UUID" }, { status: 400 });
  }

  try {
    await deleteApiKey(keyId.value, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting API key:", error);
    return NextResponse.json({ error: "Failed to delete API key" }, { status: 500 });
  }
}
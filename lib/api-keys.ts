import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { getSupabase } from "./server/supabase";

/** Extracts the raw key from an `Authorization: Bearer <key>` header. */
export function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

/**
 * API key handling for the public ingestion API.
 *
 * Keys look like `ab_live_<43 base64url chars>`. Only a SHA-256 hash is
 * persisted; the raw value is returned exactly once at creation time.
 */

export const API_KEY_PREFIX = "ab_live_";

export interface GeneratedApiKey {
  /** Full key — show to the user once, then never again. */
  raw: string;
  /** SHA-256 hex digest, what is stored in the database. */
  hash: string;
  /** Short display prefix, e.g. ab_live_x7f2… */
  prefix: string;
}

export function generateApiKey(): GeneratedApiKey {
  const entropy = randomBytes(32).toString("base64url");
  const raw = `${API_KEY_PREFIX}${entropy}`;
  return {
    raw,
    hash: hashApiKey(raw),
    prefix: `${API_KEY_PREFIX}${entropy.slice(0, 4)}`,
  };
}

export function hashApiKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export interface ApiKeyRecord {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

/**
 * Resolves an `Authorization: Bearer <key>` header to the owning user id.
 * Returns null when the key is unknown. Touches last_used_at on success.
 */
export async function verifyApiKey(rawKey: string): Promise<string | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null;
  const supabase = getSupabase();
  const hash = hashApiKey(rawKey);

  const { data, error } = await supabase
    .from("api_keys")
    .select("user_id")
    .eq("key_hash", hash)
    .maybeSingle();

  if (error) {
    console.error("Error verifying API key:", error);
    return null;
  }
  if (!data) return null;

  // Best-effort last-used stamp; failures must not break ingestion.
  await supabase
    .from("api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("key_hash", hash);

  return data.user_id as string;
}

export async function createApiKey(
  userId: string,
  name: string
): Promise<GeneratedApiKey & { id: string }> {
  const supabase = getSupabase();
  const generated = generateApiKey();

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: userId,
      name,
      key_hash: generated.hash,
      prefix: generated.prefix,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Error creating API key:", error);
    throw error;
  }

  return { id: data.id as string, ...generated };
}

export async function listApiKeys(userId: string): Promise<ApiKeyRecord[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, user_id, name, prefix, created_at, last_used_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error listing API keys:", error);
    throw error;
  }

  return data as ApiKeyRecord[];
}

export async function deleteApiKey(id: string, userId: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from("api_keys")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) {
    console.error("Error deleting API key:", error);
    throw error;
  }
}
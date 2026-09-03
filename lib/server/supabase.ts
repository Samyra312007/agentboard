import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

/**
 * Server-only Supabase client using the service-role key.
 *
 * IMPORTANT: this module is guarded by `server-only` — importing it from a
 * client component fails the build. The service-role key bypasses RLS and
 * must never be shipped to the browser.
 */

let cachedClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!cachedClient) {
    const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    cachedClient = createClient(url, serviceKey, {
      auth: { persistSession: false },
    });
  }
  return cachedClient;
}
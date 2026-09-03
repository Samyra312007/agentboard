"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (anon key only — never the service role).
 * Session is persisted in cookies by @supabase/ssr automatically.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
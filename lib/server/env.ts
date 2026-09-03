/**
 * Environment variable access helpers.
 *
 * All env access in the codebase should go through these functions so that
 * missing configuration fails with a clear, actionable message instead of
 * cryptic undefined errors. Validation is lazy: nothing throws at import
 * time, only when a value is actually needed (keeps `next build` working
 * without a configured environment).
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        "See .env.local.example for the full list of required variables."
    );
  }
  return value.trim();
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name];
  if (!value || value.trim() === "") return undefined;
  return value.trim();
}
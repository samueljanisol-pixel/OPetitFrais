/** Contournement PGRST303 « JWT issued at future » (skew Auth ↔ PostgREST côté Supabase). */

export function isSupabaseDataApiUrl(url: string, supabaseUrl: string): boolean {
  if (!url.startsWith(supabaseUrl)) return false;
  return (
    url.includes("/rest/v1/") ||
    url.includes("/storage/v1/") ||
    url.includes("/functions/v1/")
  );
}

export function isSupabaseAuthApiUrl(url: string, supabaseUrl: string): boolean {
  return url.startsWith(supabaseUrl) && url.includes("/auth/v1/");
}

export async function readFetchUrl(input: RequestInfo | URL): Promise<string> {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return input.url;
}

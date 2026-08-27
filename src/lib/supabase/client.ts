import { createBrowserClient } from "@supabase/ssr";
import { isSupabaseAuthApiUrl, isSupabaseDataApiUrl, readFetchUrl } from "@/lib/supabase/pgrst303";

/**
 * Client navigateur. Les appels REST/Storage passent par `/api/supabase-proxy`
 * pour contourner PGRST303 (« JWT issued at future ») côté PostgREST Supabase.
 * Auth reste en direct.
 */
export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }

  return createBrowserClient(url, anonKey, {
    global: {
      fetch: async (input, init) => {
        const reqUrl = await readFetchUrl(input);
        if (isSupabaseAuthApiUrl(reqUrl, url)) {
          return fetch(input, init);
        }
        if (isSupabaseDataApiUrl(reqUrl, url)) {
          const suffix = reqUrl.slice(url.length);
          const headers = new Headers(init?.headers);
          headers.delete("Authorization");
          headers.delete("apikey");
          return fetch(`/api/supabase-proxy${suffix}`, {
            ...init,
            headers,
            credentials: "same-origin",
          });
        }
        return fetch(input, init);
      },
    },
  });
}

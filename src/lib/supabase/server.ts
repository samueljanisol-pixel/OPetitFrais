import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseAuthApiUrl, isSupabaseDataApiUrl, readFetchUrl } from "@/lib/supabase/pgrst303";

/**
 * Client serveur authentifié (cookies).
 * Contournement PGRST303 : les appels data utilisent la service role après contrôle getUser().
 * Auth reste sur le JWT utilisateur (Auth API ne rejette pas ces jetons).
 */
export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)");
  }

  const cookieStore = await cookies();

  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Dans certains contextes (RSC), setAll peut être bloqué.
        }
      },
    },
    global: {
      fetch: async (input, init) => {
        const reqUrl = await readFetchUrl(input);
        if (!serviceKey || isSupabaseAuthApiUrl(reqUrl, url) || !isSupabaseDataApiUrl(reqUrl, url)) {
          return fetch(input, init);
        }

        // Évite la récursion : getUser() ne doit pas repasser par ce swap.
        const authProbe = createServerClient(url, anonKey, {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll() {},
          },
        });
        const { data: userData } = await authProbe.auth.getUser();
        if (!userData.user) {
          return fetch(input, init);
        }

        const headers = new Headers(init?.headers);
        headers.set("apikey", serviceKey);
        headers.set("Authorization", `Bearer ${serviceKey}`);
        return fetch(input, { ...init, headers });
      },
    },
  });

  return client;
}

export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase non configuré (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)");
  }
  // Service role: uniquement côté serveur.
  return createServerClient(url, serviceKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {},
    },
  });
}

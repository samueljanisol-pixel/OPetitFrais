import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { canAccessPath } from "@/lib/auth/route-permissions";

const PUBLIC_PATHS = ["/login", "/api", "/_next", "/favicon.ico", "/manifest.webmanifest", "/sw.js", "/icons", "/icon.png"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

/** Next.js 16+ : la couche « middleware » s’appelle désormais proxy (fichier `proxy.ts` à côté de `app/`). */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("error", "configuration");
    return NextResponse.redirect(loginUrl);
  }

  const res = NextResponse.next();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) {
          req.cookies.set(name, value);
          res.cookies.set(name, value, options);
        }
      },
    },
  });

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const { data: keysRaw, error: permErr } = await supabase.rpc("get_my_permission_keys");
  const keys = new Set<string>(permErr || !Array.isArray(keysRaw) ? [] : (keysRaw as string[]));

  const { data: prof } = await supabase
    .from("profiles")
    .select("roles(is_full_access)")
    .eq("user_id", data.user.id)
    .maybeSingle();

  const isFullAccess =
    (prof?.roles as { is_full_access?: boolean } | null | undefined)?.is_full_access ?? true;

  if (!canAccessPath(pathname, keys, isFullAccess)) {
    const deny = req.nextUrl.clone();
    deny.pathname = "/access-refuse";
    deny.search = "";
    return NextResponse.redirect(deny);
  }

  return res;
}

export const config = {
  matcher: [
    "/",
    "/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)).*)",
  ],
};

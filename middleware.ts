import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PREFIXES = ["/", "/historique-ca"];
const PUBLIC_PATHS = ["/login", "/api", "/_next", "/favicon.ico", "/manifest.webmanifest", "/sw.js", "/icons", "/icon.png"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return NextResponse.next();

  // Protéger uniquement les pages UI (pas les assets)
  const shouldProtect = PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!shouldProtect) return NextResponse.next();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return NextResponse.next();

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

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)).*)"],
};


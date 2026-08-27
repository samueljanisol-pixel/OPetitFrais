import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";

type RouteCtx = { params: Promise<{ path: string[] }> };

async function proxy(req: NextRequest, ctx: RouteCtx) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Supabase non configuré" }, { status: 500 });
  }

  const authClient = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll();
      },
      setAll() {
        /* lecture seule ici */
      },
    },
  });

  const { data: userData } = await authClient.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ message: "JWT expired", code: "PGRST301" }, { status: 401 });
  }

  const { path } = await ctx.params;
  if (!path?.length) {
    return NextResponse.json({ error: "Chemin manquant" }, { status: 400 });
  }

  const root = path[0];
  if (root !== "rest" && root !== "storage" && root !== "functions") {
    return NextResponse.json({ error: "Proxy non autorisé pour ce chemin" }, { status: 403 });
  }

  const target = new URL(`${url}/${path.join("/")}`);
  target.search = new URL(req.url).search;

  const headers = new Headers();
  headers.set("apikey", serviceKey);
  headers.set("Authorization", `Bearer ${serviceKey}`);

  for (const name of [
    "Accept",
    "Content-Type",
    "Prefer",
    "Range",
    "Accept-Profile",
    "Content-Profile",
    "X-Upsert",
    "x-upsert",
  ]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? await req.arrayBuffer() : undefined;

  const upstream = await fetch(target, {
    method,
    headers,
    body,
  });

  const outHeaders = new Headers();
  for (const name of [
    "content-type",
    "content-range",
    "content-profile",
    "prefer",
    "preference-applied",
    "location",
  ]) {
    const v = upstream.headers.get(name);
    if (v) outHeaders.set(name, v);
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}

export async function GET(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx);
}
export async function POST(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx);
}
export async function PUT(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx);
}
export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx);
}
export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx);
}
export async function HEAD(req: NextRequest, ctx: RouteCtx) {
  return proxy(req, ctx);
}
export async function OPTIONS() {
  return new NextResponse(null, { status: 204 });
}

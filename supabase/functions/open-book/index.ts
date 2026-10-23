// Public reader for a released Open Book (#1085): GET /functions/v1/open-book/<slug>[?part=meta].
//
// Visitors are anonymous, so JWT verification is off at the gateway via
// `[functions.open-book] verify_jwt = false` in `supabase/config.toml` (per-function config files are NOT
// read). The function reads with the service role and serves only an open book's released snapshot, never a
// table row; every other case is the same 404 so nothing leaks about which slugs, owners or plans exist.
import { createClient } from "@supabase/supabase-js";
import { withCors } from "../_shared/cors.ts";
import { reportEdgeError } from "../_shared/observability/report.ts";
import { isChildAccount } from "../_shared/accountGate.ts";
import {
  buildBody,
  type BookRow,
  canServe,
  isNotModified,
  makeEtag,
  NOT_FOUND_BODY,
  parsePart,
  parseSlug,
  type ReleaseRow,
} from "./book.ts";

const JSON_TYPE = "application/json; charset=utf-8";

function notFound(): Response {
  return new Response(NOT_FOUND_BODY, {
    status: 404,
    headers: { "Content-Type": JSON_TYPE, "Cache-Control": "no-store" },
  });
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, OPTIONS" } });
  }

  const url = new URL(req.url);
  const slug = parseSlug(url.pathname);
  if (!slug) return notFound();
  const part = parsePart(url.search);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const { data: book, error: bookErr } = await admin
      .from("open_books")
      .select("campaign_id, slug, is_open, allow_pdf, indexable, live_release_id, updated_at")
      .eq("slug", slug)
      .eq("is_open", true)
      .maybeSingle();
    if (bookErr) throw bookErr;
    if (!book || !book.live_release_id) return notFound();

    const [releaseRes, campaignRes] = await Promise.all([
      admin
        .from("open_book_releases")
        .select("id, number, note, created_at, pdf_url, stats, snapshot")
        .eq("id", book.live_release_id)
        .eq("campaign_id", book.campaign_id)
        .maybeSingle(),
      admin.from("campaigns").select("user_id").eq("id", book.campaign_id).maybeSingle(),
    ]);
    if (releaseRes.error) throw releaseRes.error;
    if (campaignRes.error) throw campaignRes.error;
    const release = releaseRes.data as ReleaseRow | null;
    const ownerId = (campaignRes.data?.user_id as string | undefined) ?? null;
    if (!release || !ownerId) return notFound();

    const ownerIsChild = await isChildAccount(admin, ownerId);
    const { data: isPro, error: proErr } = await admin.rpc("is_user_pro", { p_user_id: ownerId });
    if (proErr) throw proErr;

    const row: BookRow = {
      slug: book.slug,
      is_open: book.is_open,
      allow_pdf: book.allow_pdf,
      indexable: book.indexable,
      live_release_id: book.live_release_id,
      updated_at: book.updated_at,
    };
    if (!canServe({ book: row, release, ownerId, ownerIsChild, ownerIsPro: isPro === true })) {
      return notFound();
    }

    const etag = makeEtag(release.id, row.updated_at, part);
    const headers = {
      "Cache-Control": "public, max-age=60, s-maxage=60",
      ETag: etag,
    };
    if (isNotModified(req.headers.get("If-None-Match"), etag)) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(JSON.stringify(buildBody(row, release, part)), {
      status: 200,
      headers: { ...headers, "Content-Type": JSON_TYPE },
    });
  } catch (e) {
    // Any lookup failure refuses like an unknown book (fails closed), but is still reported.
    console.error("open-book lookup failed:", e);
    await reportEdgeError(e, req);
    return notFound();
  }
}));

import { createClient } from "@supabase/supabase-js";
import {
  buildRuleRow,
  buildRulesetRow,
  DOCUMENT_KEYS,
  type Open5eListResponse,
  type Open5eV2Rule,
  type Open5eV2Ruleset,
  type SrdRuleRow,
} from "./rulesMapping.ts";

// The gateway (verify_jwt, on by default) has already verified the bearer's
// signature before the handler runs, so the payload's `role` claim can be
// trusted without re-verification. Comparing the raw bearer to the injected
// SUPABASE_SERVICE_ROLE_KEY env var is NOT reliable here: projects carrying
// both legacy-JWT and new-format API keys can have a valid service-role JWT
// that string-differs from the injected key.
function verifiedJwtRole(bearer: string): string | null {
  const payload = bearer.split(".")[1];
  if (!payload) return null;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.role === "string" ? json.role : null;
  } catch {
    return null;
  }
}

// Open5e v2 `/v2/rulesets/` (sections/groupings, e.g. "Combat", "Exploration")
// and `/v2/rules/` (glossary-style entries) for BOTH the 2014 (SRD 5.1) and
// 2024 (SRD 5.2) editions — see #555.
//
// Earlier this function synced v1 `/v1/sections/` (2014-only prose sections,
// see #142) because the rest of the app only understood the 2014 edition. Now
// that spells/monsters/items/species/classes/rules all carry an explicit
// `ruleset` column (migration 20260720000018), the Compendium can — and
// should — carry both editions too, scoped client-side via useRuleset()
// (see src/composables/useRules.ts's useSrdRules()).
//
// v1 sections were a flat list with a free-text `parent` name; v2 splits that
// into rulesets (the section/category) and rules (the entries within it),
// linked by key. A ruleset becomes a top-level (parent) row; each rule nests
// under it via `parent_slug` = the ruleset's key. See rulesMapping.ts for the
// row-shape mapping (pure, unit-tested in rulesMapping.test.ts).
//
// `document__key__in` is used (not `document__key`) because the plain-value
// filter is silently ignored on some v2 endpoints — project standard is
// `__in` everywhere against Open5e v2.

const OPEN5E_V2_BASE = "https://api.open5e.com/v2";
const DOCUMENT_KEYS_PARAM = DOCUMENT_KEYS.join(",");
const OPEN5E_RULESETS_URL =
  `${OPEN5E_V2_BASE}/rulesets/?document__key__in=${DOCUMENT_KEYS_PARAM}&limit=500&format=json`;
const OPEN5E_RULES_URL =
  `${OPEN5E_V2_BASE}/rules/?document__key__in=${DOCUMENT_KEYS_PARAM}&limit=500&format=json`;

// Open5e's edge (Cloudflare) 403s requests with no/blocklisted User-Agent header
// (verified against the live API — the Deno/curl default UA passes, a bare
// Python-urllib-style UA doesn't); an explicit descriptive UA avoids that class
// of failure outright.
const FETCH_HEADERS = { "User-Agent": "grimoire-sync-srd-rules (+https://dungeongrimoire.com)" };

const BATCH = 100;

async function fetchAll<T>(url: string): Promise<T[]> {
  const results: T[] = [];
  let next: string | null = url;
  while (next) {
    const res = await fetch(next, { headers: FETCH_HEADERS });
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${next}`);
    const json: Open5eListResponse<T> = await res.json();
    results.push(...json.results);
    next = json.next;
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    // Admin-only: this triggers a full canonical srd_rules re-sync. The gateway
    // verifies the JWT (verify_jwt default), but any authenticated user would
    // otherwise reach this handler, so gate on the caller's verified admin
    // claim (app_metadata.role is server-controlled and signed), mirroring
    // is_app_admin() in the DB.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ ok: false, error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }
    // Allow the trusted cron/service-role caller (it passes the service-role key
    // as the bearer token); otherwise require a verified admin user. Either way,
    // an ordinary authenticated user cannot trigger a canonical re-sync.
    const bearer = authHeader.replace(/^Bearer\s+/i, "");
    const isServiceRole = verifiedJwtRole(bearer) === "service_role";
    if (!isServiceRole) {
      const caller = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: { user }, error: authError } = await caller.auth.getUser();
      if (authError || !user) {
        return new Response(
          JSON.stringify({ ok: false, error: "Unauthorized" }),
          { status: 401, headers: { "Content-Type": "application/json" } },
        );
      }
      if (user.app_metadata?.role !== "admin") {
        return new Response(
          JSON.stringify({ ok: false, error: "Forbidden" }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const [rulesets, rules] = await Promise.all([
      fetchAll<Open5eV2Ruleset>(OPEN5E_RULESETS_URL),
      fetchAll<Open5eV2Rule>(OPEN5E_RULES_URL),
    ]);

    const rows: SrdRuleRow[] = [
      ...rulesets.map(buildRulesetRow),
      ...rules.map(buildRuleRow),
    ];

    // Remove rows this sync didn't write before upserting fresh v2 data.
    // Legacy rows come in two shapes (both backfilled by migration
    // 20260720000018 with `source_record_key` = the row's own UUID): the old
    // v1-sections sync (`source_document_key = 'srd-5.1'`) AND an earlier
    // abandoned v2-rulesets sync whose rows already carry 'srd-2024' — so
    // filtering on document key alone is NOT sufficient (their stale `slug`s
    // collide with the fresh upsert and the whole run 500s). Rows written by
    // this sync are the only ones whose provenance carries an `endpoint`
    // marker; everything else is legacy and goes. Idempotent: a no-op once
    // the table has fully transitioned.
    const { error: legacyDeleteError, count: legacyDeleted } = await supabase
      .from("srd_rules")
      .delete({ count: "exact" })
      .is("provenance->>endpoint", null);
    if (legacyDeleteError) throw legacyDeleteError;
    const { error: strayDeleteError, count: strayDeleted } = await supabase
      .from("srd_rules")
      .delete({ count: "exact" })
      .not("source_document_key", "in", `(${DOCUMENT_KEYS_PARAM})`);
    if (strayDeleteError) throw strayDeleteError;
    const deletedCount = (legacyDeleted ?? 0) + (strayDeleted ?? 0);

    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const { error } = await supabase
        .from("srd_rules")
        .upsert(batch, { onConflict: "source_document_key,source_record_key" });
      if (error) throw error;
      upserted += batch.length;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        synced: upserted,
        deleted_stale: deletedCount,
        document_keys: DOCUMENT_KEYS,
        rulesets_fetched: rulesets.length,
        rules_fetched: rules.length,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-srd-rules error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

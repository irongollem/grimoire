import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// v2 rulesets API — each ruleset embeds its rules as a nested array
const OPEN5E_RULESETS_BASE = "https://api.open5e.com/v2/rulesets/";
const BATCH = 100;

interface EmbeddedRule {
  url: string;
  name: string;
  desc: string;
}

interface Open5eV2Ruleset {
  key: string;     // e.g. "srd-2024_combat"
  name: string;    // e.g. "Combat"
  desc: string;
  rules: EmbeddedRule[];
}

interface Open5eListResponse {
  count: number;
  next: string | null;
  results: Open5eV2Ruleset[];
}

function slugFromUrl(url: string): string {
  return url.replace(/\?.*$/, "").replace(/\/$/, "").split("/").pop() ?? url;
}

async function fetchAllRulesets(): Promise<Open5eV2Ruleset[]> {
  const results: Open5eV2Ruleset[] = [];
  let url: string | null = `${OPEN5E_RULESETS_BASE}?limit=100&format=json`;
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`open5e fetch failed: ${res.status} ${url}`);
    const json: Open5eListResponse = await res.json();
    results.push(...json.results);
    url = json.next;
  }
  return results;
}

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rulesets = await fetchAllRulesets();

    const rows: Array<{
      slug: string;
      name: string;
      content: string;
      parent_slug: string | null;
      doc_slug: string;
    }> = [];

    for (const rs of rulesets) {
      // Parent row — the ruleset itself
      rows.push({
        slug:        rs.key,
        name:        rs.name,
        content:     rs.desc ?? "",
        parent_slug: null,
        doc_slug:    "srd-2024",
      });

      // Child rows — the individual rules embedded in the ruleset
      for (const rule of rs.rules ?? []) {
        rows.push({
          slug:        slugFromUrl(rule.url),
          name:        rule.name,
          content:     rule.desc ?? "",
          parent_slug: rs.key,
          doc_slug:    "srd-2024",
        });
      }
    }

    // Upsert in batches
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from("srd_rules")
        .upsert(rows.slice(i, i + BATCH), { onConflict: "slug" });
      if (error) throw error;
      upserted += rows.slice(i, i + BATCH).length;
    }

    return new Response(
      JSON.stringify({ ok: true, synced: upserted, total: rows.length }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-srd-rules error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

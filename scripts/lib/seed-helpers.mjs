#!/usr/bin/env node
/**
 * Shared helpers for SRD seeding scripts.
 * Requires VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in environment.
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function requireEnv() {
  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error("Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.");
    process.exit(1);
  }
}

// ── Open5e ─────────────────────────────────────────────────────────────────────

export async function fetchOpen5eDocuments() {
  const docs = [];
  let url = "https://api.open5e.com/v1/documents/?limit=100";
  while (url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    docs.push(...json.results);
    url = json.next;
  }
  return docs;
}

// ── Supabase REST ──────────────────────────────────────────────────────────────

export async function supabaseRequest(path, options = {}) {
  const { headers: extraHeaders, ...restOptions } = options;
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    ...restOptions,
    headers: {
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      "Prefer": "resolution=merge-duplicates",
      ...extraHeaders,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Supabase ${path}: HTTP ${res.status} — ${text}`);
  return text ? JSON.parse(text) : [];
}

export async function upsertBatch(table, rows, BATCH = 50) {
  for (let i = 0; i < rows.length; i += BATCH) {
    await supabaseRequest(`/${table}`, {
      method: "POST",
      headers: { "Prefer": "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + BATCH)),
    });
    process.stdout.write(`\r  Upserted ${Math.min(i + BATCH, rows.length)} / ${rows.length}`);
  }
  console.log();
}

// ── CLI arg parsing ─────────────────────────────────────────────────────────────
// Resolves --list / --all / explicit slug args to a list of document slugs.
// --list prints the available slugs and exits.

export async function resolveCliSlugs(args, defaultSlug = "wotc-srd") {
  const listFlag = args.includes("--list");
  const allFlag  = args.includes("--all");
  const slugArgs = args.filter((a) => !a.startsWith("--"));

  if (listFlag) {
    console.log("Fetching available Open5e documents…");
    const docs = await fetchOpen5eDocuments();
    docs.forEach((d) => console.log(`  ${d.slug.padEnd(30)} ${d.title}`));
    process.exit(0);
  }

  if (allFlag) {
    console.log("Fetching all available Open5e document slugs…");
    const docs = await fetchOpen5eDocuments();
    const slugs = docs.map((d) => d.slug);
    console.log(`  Found ${slugs.length} documents.\n`);
    return slugs;
  }

  return slugArgs.length > 0 ? slugArgs : [defaultSlug];
}

#!/usr/bin/env node
// One-off: read /tmp/kind-country-items.jsonl and emit a single bulk INSERT
// statement scoped to the Late in the Kind Country campaign.
//
// Usage:  node scripts/build-kind-country-sql.mjs > out.sql

import { readFileSync } from "node:fs";

const CAMPAIGN_ID = "f6220b21-bff2-4419-a8c1-3dd7d6fc371b";
const USER_ID     = "fc8ae595-641f-4127-87ad-03588f3710d1";
const SOURCE      = "Late in the Kind Country";

const lines = readFileSync("/tmp/kind-country-items.jsonl", "utf8").trim().split("\n");

// Escape a string for PG using $tag$...$tag$ dollar-quoting — safer than single quotes for prose.
function dq(s) {
  if (s == null) return "NULL";
  // Pick a tag that doesn't appear in the body.
  let tag = "kc";
  while (s.includes(`$${tag}$`)) tag += "_";
  return `$${tag}$${s}$${tag}$`;
}

function arr(values) {
  if (!values || !values.length) return "'{}'";
  // tags: keep ARRAY syntax with dollar-quoted strings.
  return `ARRAY[${values.map((v) => dq(v)).join(",")}]::text[]`;
}

function rowSql(o) {
  return `(
    ${dq(o.name)},
    '${o.item_type}',
    '${o.rarity}',
    ${dq(o.description || "")},
    ${dq(o.dm_notes)},
    ${dq(o.mundane_description)},
    ${arr(o.tags)},
    ${dq(SOURCE)},
    '${CAMPAIGN_ID}',
    '${USER_ID}',
    false,
    false,
    '{}'::text[],
    '{}'::uuid[]
  )`;
}

const items = lines.map((l) => JSON.parse(l));
const BATCH = Number(process.argv[2] ?? 25);
const offset = Number(process.argv[3] ?? 0);
const slice = items.slice(offset, offset + BATCH);

const sql = `insert into items (
  name, item_type, rarity, description, dm_notes, mundane_description, tags, source,
  campaign_id, user_id, requires_attunement, is_arcane_focus, properties, spell_ids
) values
${slice.map(rowSql).join(",\n")}
on conflict do nothing
returning id;`;

process.stdout.write(sql);
process.stderr.write(`emitted batch: offset=${offset} size=${slice.length} total=${items.length}\n`);

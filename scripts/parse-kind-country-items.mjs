#!/usr/bin/env node
// One-off: parse the Late in the Kind Country items doc into JSONL for bulk import.
//
// Usage:  node scripts/parse-kind-country-items.mjs <input.md> > out.jsonl
//
// Each line is one item: { name, description, dm_notes, mundane_description, tags, item_type, rarity }.
// The DB columns campaign_id / user_id / source are injected by the loader, not here.

import { readFileSync } from "node:fs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("usage: parse-kind-country-items.mjs <markdown-file>");
  process.exit(1);
}

const text = readFileSync(inputPath, "utf8");
const lines = text.split("\n");

// Skip everything before the first ### entry header.
let firstHeader = lines.findIndex((l) => /^### /.test(l));
if (firstHeader === -1) {
  console.error("no ### headers found");
  process.exit(1);
}

// Split into entries: each starts at a ### line and runs to the next ### / ## / # / ---
const entries = [];
let current = null;
for (let i = firstHeader; i < lines.length; i++) {
  const line = lines[i];
  if (/^### /.test(line)) {
    if (current) entries.push(current);
    current = { name: line.replace(/^### /, "").trim(), body: [] };
  } else if (/^## /.test(line) || /^# /.test(line)) {
    // New top-level section ends current entry; we still keep going to find next ###
    if (current) entries.push(current);
    current = null;
  } else if (current) {
    current.body.push(line);
  }
}
if (current) entries.push(current);

// Tags inferred from keywords in the body.
const TAG_TRIGGERS = [
  ["keepsake", /\bkeepsake\b/i],
  ["ritual implement", /\britual\s+implement\b/i],
  ["witch-recognized", /\bwitch-recognized\b/i],
  ["reference", /^\*\*reference\b/im],
  ["mundane", /\bmundane\b/i],
  ["magic", /\bmagic\b/i],
  ["leaning", /\bleaning\b/i],
  ["sister-piece", /sister[-\s]?piece/i],
  ["campaign-spine", /campaign[-\s]?carry|spine/i],
];

function inferTags(name, body, chapter) {
  const tags = new Set(["kind-country"]);
  if (chapter) tags.add(chapter.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  for (const [tag, re] of TAG_TRIGGERS) {
    if (re.test(body)) tags.add(tag);
  }
  return [...tags];
}

// Rarity heuristic: if the body has any **Mechanic:** with observable effect → uncommon.
// If the mechanic explicitly says "None observable" or "Reference / keepsake" → mundane.
// Default → mundane.
function inferRarity(body) {
  const m = body.match(/\*\*Mechanic:\*\*\s*([\s\S]*?)(?=\n\n|\n\*\*|$)/);
  if (!m) return "mundane";
  const mechanic = m[1].trim();
  if (/^(None|Reference|Keepsake|Ref\b)/i.test(mechanic)) return "mundane";
  if (/none\s+observable/i.test(mechanic) && !/advantage|grants|points|sheds|rings|lights/i.test(mechanic)) return "mundane";
  return "uncommon";
}

// Item type: most are gear (keepsakes). A few clear cases.
function inferItemType(name, body) {
  const n = name.toLowerCase();
  if (/\b(lantern|knocker|cup|saucer|compass|nail|knife|whistle|bell|key)\b/.test(n)) return "wondrous_item";
  if (/\b(potion|brew|tincture)\b/.test(n)) return "potion";
  return "gear";
}

// Pull the GM aside: a paragraph wrapped in single underscores starting with _GM-side:
function extractGmAside(body) {
  const m = body.match(/_GM-side:\s*([\s\S]*?)_\s*$/m);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

// Pull a labelled section like **Provenance:**, **Mechanic:**, **Owner:**.
function extractLabel(body, label) {
  const re = new RegExp(`\\*\\*${label}:\\*\\*\\s*([\\s\\S]*?)(?=\\n\\*\\*|\\n_GM-side|\\n###|$)`, "i");
  const m = body.match(re);
  return m ? m[1].trim().replace(/\s+/g, " ") : null;
}

// The opening prose: lines after the heading up to the first **Provenance:** or **Mechanic:** marker.
function extractProse(body) {
  const cut = body.search(/\n\*\*(Provenance|Mechanic|Owner):\*\*/);
  const slice = cut === -1 ? body : body.slice(0, cut);
  return slice.split("\n").map((l) => l.trim()).filter(Boolean).join(" ");
}

// Track current chapter. Doc structure: `# I. Section`, `## Chapter Name`, `### Item`.
// Reset chap on `# ` (new top-level section) so spine items don't inherit Field Glossary.
const chapterMap = {};
{
  let chap = null;
  let section = null;
  for (const line of lines) {
    if (/^# /.test(line) && !/^## /.test(line) && !/^### /.test(line)) {
      section = line.replace(/^# /, "").trim();
      chap = null;
    } else if (/^## /.test(line) && !/^### /.test(line)) {
      chap = line.replace(/^## /, "").trim().split("—")[0].trim();
    } else if (/^### /.test(line)) {
      const name = line.replace(/^### /, "").trim();
      // First-write-wins so spine items keep "I. The Campaign-Carry Spine" instead of
      // being overwritten by their chapter callback in Section II.
      if (!(name in chapterMap)) {
        chapterMap[name] = chap ?? (section ?? null);
      }
    }
  }
}

// Dedup: spine items (Section I) appear again as chapter back-references in Section II.
// Keep the longer body — that's the canonical version (almost always Section I).
const byName = new Map();
for (const entry of entries) {
  const body = entry.body.join("\n");
  if (!body.trim()) continue;
  const prev = byName.get(entry.name);
  if (!prev || body.length > prev.body.join("\n").length) {
    byName.set(entry.name, entry);
  }
}

let count = 0;
for (const entry of byName.values()) {
  const body = entry.body.join("\n");
  if (!body.trim()) continue;
  const chapter = chapterMap[entry.name] ?? null;
  const prose = extractProse(body);
  const provenance = extractLabel(body, "Provenance");
  const mechanic = extractLabel(body, "Mechanic");
  const owner = extractLabel(body, "Owner");
  const gmAside = extractGmAside(body);

  // Description = prose + structured sections. Plain text — RichTextViewer falls back to string.
  const descParts = [];
  if (prose) descParts.push(prose);
  if (provenance) descParts.push(`\nProvenance: ${provenance}`);
  if (mechanic) descParts.push(`\nMechanic: ${mechanic}`);
  if (owner) descParts.push(`\nOwner: ${owner}`);
  const description = descParts.join("\n").trim();

  const tags = inferTags(entry.name, body, chapter);
  const rarity = inferRarity(body);
  const item_type = inferItemType(entry.name, body);

  const out = {
    name: entry.name,
    description,
    dm_notes: gmAside,
    mundane_description: prose || null,
    tags,
    item_type,
    rarity,
    chapter,
  };
  console.log(JSON.stringify(out));
  count++;
}
console.error(`parsed ${count} entries`);

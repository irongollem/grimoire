#!/usr/bin/env node
/**
 * Seeds the shared srd_spells table from the Open5e SRD API, then backfills
 * image_url + image_focal_point from canonical srd_art_defaults rows.
 *
 * Run once (and re-run to pick up new canonical art):
 *   node --env-file=.env.local scripts/seed-srd-spells.mjs
 *
 * Optional flags:
 *   --all              Seed from all available Open5e document slugs
 *   --list             List available Open5e document slugs and exit
 *   <slug> [<slug>…]   Seed only the listed document slugs (default: wotc-srd)
 *
 * Required env vars in .env.local:
 *   VITE_SUPABASE_URL        — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 */

import { requireEnv, fetchOpen5eDocuments, supabaseRequest, upsertBatch, resolveCliSlugs } from "./lib/seed-helpers.mjs";

requireEnv();

// ── helpers ───────────────────────────────────────────────────────────────────

const SPELL_SCHOOLS = [
  "abjuration","conjuration","divination","enchantment",
  "evocation","illusion","necromancy","transmutation",
];

const SPELL_CLASSES = [
  "Artificer","Bard","Cleric","Druid","Paladin","Ranger",
  "Sorcerer","Warlock","Wizard","Fighter (Eldritch Knight)","Rogue (Arcane Trickster)",
];

const CASTING_TIME_MAP = {
  "1 action": "Action",
  "1 bonus action": "Bonus Action",
  "1 reaction": "Reaction",
  "1 minute": "1 Minute",
  "10 minutes": "10 Minutes",
  "1 hour": "1 Hour",
  "8 hours": "8 Hours",
  "24 hours": "24 Hours",
};

const DURATION_MAP = {
  "instantaneous": "Instantaneous",
  "until dispelled": "Until Dispelled",
  "1 round": "1 Round",
  "concentration, up to 1 minute": "Concentration, up to 1 minute",
  "concentration, up to 10 minutes": "Concentration, up to 10 minutes",
  "concentration, up to 1 hour": "Concentration, up to 1 hour",
  "concentration, up to 8 hours": "Concentration, up to 8 hours",
  "up to 1 minute": "Concentration, up to 1 minute",
  "up to 10 minutes": "Concentration, up to 10 minutes",
  "up to 1 hour": "Concentration, up to 1 hour",
  "up to 8 hours": "Concentration, up to 8 hours",
  "1 minute": "1 Minute",
  "10 minutes": "10 Minutes",
  "1 hour": "1 Hour",
  "8 hours": "8 Hours",
  "24 hours": "24 Hours",
  "7 days": "7 Days",
  "30 days": "30 Days",
};

const FEET_MAP = {
  "5 feet": "5 ft.", "10 feet": "10 ft.", "30 feet": "30 ft.",
  "60 feet": "60 ft.", "90 feet": "90 ft.", "120 feet": "120 ft.",
  "150 feet": "150 ft.", "300 feet": "300 ft.", "500 feet": "500 ft.",
};

function normalizeSchool(raw) {
  const name = typeof raw === "string" ? raw : (raw?.name ?? "");
  const lower = name.toLowerCase().trim();
  return SPELL_SCHOOLS.includes(lower) ? lower : "evocation";
}

function normalizeLevel(spell) {
  if ((spell.level ?? "").toLowerCase() === "cantrip") return 0;
  return spell.level_int ?? 0;
}

function normalizeCastingTime(raw) {
  const lower = (raw ?? "").toLowerCase().trim();
  if (CASTING_TIME_MAP[lower]) return { casting_time: CASTING_TIME_MAP[lower], casting_time_custom: null };
  if (lower.startsWith("1 reaction")) return { casting_time: "Reaction", casting_time_custom: raw };
  return { casting_time: "Special", casting_time_custom: raw };
}

function normalizeDuration(raw) {
  const lower = (raw ?? "").toLowerCase().trim();
  if (DURATION_MAP[lower]) return { duration: DURATION_MAP[lower], duration_custom: null };
  return { duration: "Special", duration_custom: raw };
}

function normalizeRange(raw) {
  const lower = (raw ?? "").toLowerCase().trim();
  if (["self","touch","sight","unlimited"].includes(lower)) {
    return { range: lower.charAt(0).toUpperCase() + lower.slice(1), range_custom: null };
  }
  if (lower === "1 mile") return { range: "1 mile", range_custom: null };
  if (FEET_MAP[lower]) return { range: FEET_MAP[lower], range_custom: null };
  return { range: "Special", range_custom: raw };
}

const VALID_CLASSES = new Set(SPELL_CLASSES);

function normalizeClasses(raw) {
  if (!raw) return [];
  return raw.split(",").map((c) => c.trim()).filter((c) => VALID_CLASSES.has(c));
}

function normalizeComponents(raw) {
  if (!raw) return [];
  return raw.split(",").map((c) => c.trim()).filter((c) => ["V","S","M"].includes(c));
}

const UPCAST_DICE_RE = /(\d+d\d+)\s+(?:for|per)\s+each\s+(?:slot\s+level|level)\s+above/i;

function parseHigherLevelDamage(prose) {
  if (!prose || /heal/i.test(prose)) return null;
  const m = prose.match(UPCAST_DICE_RE);
  return m ? { dice_per_level: m[1], type: null } : null;
}

function parseHigherLevelHealing(prose) {
  if (!prose || !/heal/i.test(prose)) return null;
  const m = prose.match(UPCAST_DICE_RE);
  return m ? m[1] : null;
}

function slugToId(slug) {
  return `srd_${slug.replace(/-/g, "_")}`;
}

function transformSpell(spell) {
  const { casting_time, casting_time_custom } = normalizeCastingTime(spell.casting_time);
  const { duration, duration_custom }         = normalizeDuration(spell.duration);
  const { range, range_custom }               = normalizeRange(spell.range);
  return {
    id:                   slugToId(spell.slug),
    name:                 spell.name,
    level:                normalizeLevel(spell),
    school:               normalizeSchool(spell.school),
    casting_time,
    casting_time_custom,
    range,
    range_custom,
    components:           normalizeComponents(spell.components),
    material:             spell.material?.trim() || null,
    duration,
    duration_custom,
    concentration:        spell.concentration?.toLowerCase() === "yes",
    ritual:               spell.ritual?.toLowerCase() === "yes",
    attack_type:          null,
    save_attribute:       null,
    save_effect:          null,
    damage_rolls:         null,
    healing_dice:         null,
    target_description:   null,
    aoe_shape:            null,
    aoe_size:             null,
    condition_inflicted:  null,
    description:          spell.desc ?? "",
    higher_levels:        spell.higher_level?.trim() || null,
    higher_level_damage:  parseHigherLevelDamage(spell.higher_level),
    higher_level_healing: parseHigherLevelHealing(spell.higher_level),
    classes:              normalizeClasses(spell.dnd_class),
    tags:                 [],
    source:               spell.document__slug ?? null,
    source_title:         spell.document__title ?? null,
    source_url:           spell.document__url ?? null,
    open5e_import:        false,
    image_url:            null,
    image_focal_point:    null,
  };
}

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchSpellsForSlugs(slugs) {
  const spells = [];
  for (const slug of slugs) {
    let url = `https://api.open5e.com/v1/spells/?document__slug=${slug}&limit=100&ordering=name`;
    while (url) {
      console.log(`  Fetching: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const json = await res.json();
      spells.push(...json.results);
      url = json.next;
    }
  }
  return spells;
}

// ── backfill art from srd_art_defaults ───────────────────────────────────────

async function backfillArt() {
  const art = await supabaseRequest(
    "/srd_art_defaults?content_type=eq.spell&image_url=not.is.null&select=srd_slug,image_url,image_focal_point",
    { method: "GET", headers: { "Prefer": "" } },
  );
  if (!art.length) {
    console.log("  No canonical spell art found — skipping art backfill.");
    return;
  }
  console.log(`  Found ${art.length} spell art rows — backfilling srd_spells…`);

  // srd_art_defaults keys by lower(name); srd_spells stores original casing.
  // Fetch id+name to build the lowercase lookup map.
  const allSpells = await supabaseRequest(
    "/srd_spells?select=id,name",
    { method: "GET", headers: { "Prefer": "" } },
  );
  const nameToId = new Map(allSpells.map((s) => [s.name.toLowerCase(), s.id]));

  const PATCH_BATCH = 25;
  let patched = 0;
  for (let i = 0; i < art.length; i += PATCH_BATCH) {
    await Promise.all(
      art.slice(i, i + PATCH_BATCH).map(({ srd_slug, image_url, image_focal_point }) => {
        const id = nameToId.get(srd_slug);
        if (!id) return;
        return supabaseRequest(`/srd_spells?id=eq.${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify({ image_url, image_focal_point: image_focal_point ?? null }),
        });
      }),
    );
    patched = Math.min(i + PATCH_BATCH, art.length);
    process.stdout.write(`\r  Art patched ${patched} / ${art.length}`);
  }
  console.log();
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const slugs = await resolveCliSlugs(process.argv.slice(2));

  console.log(`=== Seeding srd_spells (sources: ${slugs.join(", ")}) ===\n`);

  console.log("Step 1: Fetching spells from Open5e…");
  const raw = await fetchSpellsForSlugs(slugs);
  console.log(`  Fetched ${raw.length} spells.\n`);

  // Deduplicate by name (same spell can appear in multiple documents)
  const seen = new Set();
  const unique = raw.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
  if (unique.length !== raw.length) {
    console.log(`  Deduplicated to ${unique.length} unique spells.\n`);
  }

  console.log("Step 2: Upserting to srd_spells table…");
  await upsertBatch("srd_spells", unique.map(transformSpell));
  console.log(`  Done — ${unique.length} rows upserted.\n`);

  console.log("Step 3: Backfilling art from srd_art_defaults…");
  await backfillArt();
  console.log("  Art backfill complete.\n");

  console.log("=== Seeding complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

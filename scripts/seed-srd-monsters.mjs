#!/usr/bin/env node
/**
 * Seeds the shared srd_monsters table from the Open5e SRD API, then backfills
 * image_url + portrait_focal_point from any canonical rows in srd_monster_art.
 *
 * Run once (and re-run to pick up new canonical art):
 *   node --env-file=.env.local scripts/seed-srd-monsters.mjs
 *
 * Required env vars in .env.local:
 *   VITE_SUPABASE_URL        — project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service-role key (bypasses RLS)
 */

import { requireEnv, supabaseRequest, upsertBatch, resolveCliSlugs } from "./lib/seed-helpers.mjs";

requireEnv();

// ── helpers ───────────────────────────────────────────────────────────────────

function toSpeedString(speed) {
  if (!speed || typeof speed !== "object") return "30 ft.";
  const parts = [];
  if (speed.walk)   parts.push(`${speed.walk} ft.`);
  if (speed.fly)    parts.push(`fly ${speed.fly} ft.`);
  if (speed.swim)   parts.push(`swim ${speed.swim} ft.`);
  if (speed.climb)  parts.push(`climb ${speed.climb} ft.`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
  if (speed.hover) {
    const i = parts.findIndex((p) => p.startsWith("fly"));
    if (i !== -1) parts[i] = parts[i].replace(" ft.", " ft. (hover)");
  }
  return parts.join(", ") || "30 ft.";
}

function toHpString(hp, dice) {
  if (!hp && !dice) return "10 (2d8+1)";
  if (!dice) return String(hp);
  return `${hp} (${dice})`;
}

function toSavingThrows(m) {
  const MAP = {
    strength_save: "Str", dexterity_save: "Dex", constitution_save: "Con",
    intelligence_save: "Int", wisdom_save: "Wis", charisma_save: "Cha",
  };
  const parts = [];
  for (const [key, label] of Object.entries(MAP)) {
    if (m[key] != null) {
      const val = m[key];
      parts.push(`${label} ${val >= 0 ? "+" : ""}${val}`);
    }
  }
  return parts.join(", ");
}

function toSkills(skills) {
  if (!skills || typeof skills !== "object") return {};
  const rec = {};
  for (const [k, v] of Object.entries(skills)) {
    rec[k.toLowerCase()] = v >= 0 ? `+${v}` : String(v);
  }
  return rec;
}

function toTraits(arr) {
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => ({ name: t.name ?? "", description: t.desc ?? "" }));
}

function toMonsterType(type) {
  const valid = [
    "aberration","beast","celestial","construct","dragon","elemental",
    "fey","fiend","giant","humanoid","monstrosity","ooze","plant","undead",
  ];
  const base = ((type ?? "").toLowerCase().trim()).split("(")[0].trim();
  return valid.includes(base) ? base : "monstrosity";
}

function toSize(size) {
  const valid = ["tiny","small","medium","large","huge","gargantuan"];
  const lower = (size ?? "medium").toLowerCase();
  return valid.includes(lower) ? lower : "medium";
}

function slugToId(slug) {
  return `srd_${slug.replace(/-/g, "_")}`;
}

function extractLegendaryResistance(desc) {
  const m = desc.match(/\((\d)\s*\/\s*[Dd]ay\)/);
  return m ? parseInt(m[1]) : 3;
}

function transformMonster(m) {
  const skills = toSkills(m.skills);
  const savingThrows = toSavingThrows(m);
  const specialAbilities = toTraits(m.special_abilities);
  const actions = toTraits(m.actions);
  const bonusActions = toTraits(m.bonus_actions);
  const reactions = toTraits(m.reactions);
  const legendaryActions = toTraits(m.legendary_actions);

  return {
    id: slugToId(m.slug),
    name: m.name,
    monster_type: toMonsterType(m.type),
    size: toSize(m.size),
    alignment: m.alignment || "unaligned",
    habitat: null,
    // Use the document slug/title from the API response — each monster knows its own source.
    // Using the filter parameter here caused every monster to be mis-tagged with the input slug.
    source: m.document__slug ?? "unknown",
    source_title: m.document__title ?? null,
    source_url: null,
    is_srd: true,
    open5e_import: false,
    tags: [],
    notes: null,
    image_url: null,
    portrait_focal_point: null,
    stat_block: {
      armor_class: m.armor_class ?? 10,
      hit_points: toHpString(m.hit_points, m.hit_dice),
      speed: toSpeedString(m.speed),
      str: m.strength ?? 10,
      dex: m.dexterity ?? 10,
      con: m.constitution ?? 10,
      int: m.intelligence ?? 10,
      wis: m.wisdom ?? 10,
      cha: m.charisma ?? 10,
      challenge_rating: String(m.challenge_rating ?? "0"),
      ...(savingThrows  ? { saving_throws: savingThrows }  : {}),
      ...(Object.keys(skills).length ? { skills } : {}),
      ...(m.damage_vulnerabilities ? { damage_vulnerabilities: m.damage_vulnerabilities } : {}),
      ...(m.damage_resistances     ? { damage_resistances: m.damage_resistances }         : {}),
      ...(m.damage_immunities      ? { damage_immunities: m.damage_immunities }            : {}),
      ...(m.condition_immunities   ? { condition_immunities: m.condition_immunities }      : {}),
      ...(m.senses     ? { senses: m.senses }         : {}),
      ...(m.languages  ? { languages: m.languages }   : {}),
      ...(specialAbilities.length  ? { special_abilities: specialAbilities } : {}),
      ...(actions.length           ? { actions }                             : {}),
      ...(bonusActions.length      ? { bonus_actions: bonusActions }         : {}),
      ...(reactions.length         ? { reactions }                           : {}),
      ...(m.legendary_desc         ? { legendary_resistance: extractLegendaryResistance(m.legendary_desc) } : {}),
      ...(legendaryActions.length  ? { legendary_actions: legendaryActions } : {}),
    },
  };
}

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchMonstersForSlugs(slugs) {
  const monsters = [];
  for (const slug of slugs) {
    let url = `https://api.open5e.com/v1/monsters/?document__slug=${slug}&limit=100&ordering=name`;
    while (url) {
      console.log(`  Fetching: ${url}`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      const json = await res.json();
      monsters.push(...json.results);
      url = json.next;
    }
  }
  return monsters;
}

// ── backfill art from srd_monster_art ────────────────────────────────────────

async function backfillArt() {
  const art = await supabaseRequest(
    "/srd_monster_art?is_canonical=eq.true&image_url=not.is.null&select=srd_id,image_url,portrait_focal_point",
    { method: "GET", headers: { "Prefer": "" } },
  );
  if (!art.length) {
    console.log("  No canonical art found — skipping art backfill.");
    return;
  }
  console.log(`  Found ${art.length} canonical art rows — backfilling srd_monsters…`);
  const PATCH_BATCH = 25;
  for (let i = 0; i < art.length; i += PATCH_BATCH) {
    await Promise.all(
      art.slice(i, i + PATCH_BATCH).map(({ srd_id, image_url, portrait_focal_point }) =>
        supabaseRequest(`/srd_monsters?id=eq.${encodeURIComponent(srd_id)}`, {
          method: "PATCH",
          headers: { "Prefer": "return=minimal" },
          body: JSON.stringify({ image_url, portrait_focal_point: portrait_focal_point ?? null }),
        }),
      ),
    );
    process.stdout.write(`\r  Art patched ${Math.min(i + PATCH_BATCH, art.length)} / ${art.length}`);
  }
  console.log();
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const slugs = await resolveCliSlugs(process.argv.slice(2));

  console.log(`=== Seeding srd_monsters (sources: ${slugs.join(", ")}) ===\n`);

  console.log("Step 1: Fetching monsters from Open5e…");
  const raw = await fetchMonstersForSlugs(slugs);
  console.log(`  Fetched ${raw.length} monsters.\n`);

  console.log("Step 2: Upserting to srd_monsters table…");
  await upsertBatch("srd_monsters", raw.map(transformMonster));
  console.log(`  Done — ${raw.length} rows upserted.\n`);

  console.log("Step 3: Backfilling art from canonical srd_monster_art…");
  await backfillArt();
  console.log("  Art backfill complete.\n");

  console.log("=== Seeding complete ===");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

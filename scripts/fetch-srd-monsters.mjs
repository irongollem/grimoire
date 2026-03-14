#!/usr/bin/env node
/**
 * Fetches all SRD 5.1 monsters from the Open5e API and generates
 * src/data/srdMonsters.ts — a read-only bestiary for Grimoire.
 *
 * Run once:  node scripts/fetch-srd-monsters.mjs
 */

import { writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_FILE = resolve(__dirname, "../src/data/srdMonsters.ts");

// ── helpers ──────────────────────────────────────────────────────────────────

function toSpeedString(speed) {
  if (!speed || typeof speed !== "object") return "30 ft.";
  const parts = [];
  if (speed.walk) parts.push(`${speed.walk} ft.`);
  if (speed.fly) parts.push(`fly ${speed.fly} ft.`);
  if (speed.swim) parts.push(`swim ${speed.swim} ft.`);
  if (speed.climb) parts.push(`climb ${speed.climb} ft.`);
  if (speed.burrow) parts.push(`burrow ${speed.burrow} ft.`);
  if (speed.hover) {
    // replace last "fly X ft." with "fly X ft. (hover)"
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
    strength_save: "Str",
    dexterity_save: "Dex",
    constitution_save: "Con",
    intelligence_save: "Int",
    wisdom_save: "Wis",
    charisma_save: "Cha",
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
    "aberration","beast","celestial","construct","dragon",
    "elemental","fey","fiend","giant","humanoid",
    "monstrosity","ooze","plant","undead",
  ];
  const lower = (type ?? "").toLowerCase().trim();
  // handle subtypes like "humanoid (any race)"
  const base = lower.split("(")[0].trim();
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

function transformMonster(m) {
  return {
    id: slugToId(m.slug),
    user_id: "",
    name: m.name,
    monster_type: toMonsterType(m.type),
    size: toSize(m.size),
    alignment: m.alignment || "unaligned",
    habitat: null,
    source: "SRD 5.1",
    tags: [],
    is_srd: true,
    image_url: null,
    card_art_url: null,
    notes: null,
    created_at: "",
    updated_at: "",
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
      saving_throws: toSavingThrows(m) || undefined,
      skills: Object.keys(toSkills(m.skills)).length ? toSkills(m.skills) : undefined,
      damage_vulnerabilities: m.damage_vulnerabilities || undefined,
      damage_resistances: m.damage_resistances || undefined,
      damage_immunities: m.damage_immunities || undefined,
      condition_immunities: m.condition_immunities || undefined,
      senses: m.senses || undefined,
      languages: m.languages || undefined,
      special_abilities: toTraits(m.special_abilities).length
        ? toTraits(m.special_abilities)
        : undefined,
      actions: toTraits(m.actions).length ? toTraits(m.actions) : undefined,
      bonus_actions: toTraits(m.bonus_actions).length
        ? toTraits(m.bonus_actions)
        : undefined,
      reactions: toTraits(m.reactions).length ? toTraits(m.reactions) : undefined,
      legendary_resistance: m.legendary_desc
        ? extractLegendaryResistance(m.legendary_desc)
        : undefined,
      legendary_actions: toTraits(m.legendary_actions).length
        ? toTraits(m.legendary_actions)
        : undefined,
    },
  };
}

function extractLegendaryResistance(desc) {
  // "If the X fails a saving throw, it can choose to succeed instead (3/Day)."
  const m = desc.match(/\((\d)\s*\/\s*[Dd]ay\)/);
  return m ? parseInt(m[1]) : 3;
}

// ── fetch ─────────────────────────────────────────────────────────────────────

async function fetchAllSrdMonsters() {
  const monsters = [];
  let url = "https://api.open5e.com/v1/monsters/?document__slug=wotc-srd&limit=100&ordering=name";

  while (url) {
    console.log(`Fetching: ${url}`);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    monsters.push(...json.results);
    url = json.next;
  }

  return monsters;
}

// ── serialise ─────────────────────────────────────────────────────────────────

function serialise(value, indent = 0) {
  const pad = " ".repeat(indent);
  const innerPad = " ".repeat(indent + 2);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => `${innerPad}${serialise(v, indent + 2)}`);
    return `[\n${items.join(",\n")},\n${pad}]`;
  }

  if (typeof value === "object") {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined);
    if (keys.length === 0) return "{}";
    const items = keys.map((k) => `${innerPad}${k}: ${serialise(value[k], indent + 2)}`);
    return `{\n${items.join(",\n")},\n${pad}}`;
  }

  return String(value);
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main() {
  const raw = await fetchAllSrdMonsters();
  console.log(`Fetched ${raw.length} monsters from Open5e`);

  const monsters = raw.map(transformMonster);
  monsters.sort((a, b) => a.name.localeCompare(b.name));

  const lines = [
    `// AUTO-GENERATED by scripts/fetch-srd-monsters.mjs — do not edit manually`,
    `// Source: Systems Reference Document 5.1 (CC-BY 4.0, Wizards of the Coast)`,
    `// Re-run the script to refresh.`,
    `import type { Monster } from "@/types/monster.types";`,
    ``,
    `export const SRD_MONSTERS: Monster[] = ${serialise(monsters, 0)};`,
    ``,
    `export function getSrdMonster(id: string): Monster | undefined {`,
    `  return SRD_MONSTERS.find((m) => m.id === id);`,
    `}`,
    ``,
  ];

  writeFileSync(OUT_FILE, lines.join("\n"), "utf8");
  console.log(`Written ${monsters.length} monsters → ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

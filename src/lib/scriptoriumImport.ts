/**
 * Scriptorium Import Engine
 *
 * Pluggable formatter registry that converts game entities (NPCs, Monsters,
 * and future types like magic items, locations, etc.) into Scriptorium documents.
 *
 * To add a new asset type:
 *   1. Implement AssetFormatter<YourType>
 *   2. Register it in FORMATTERS below
 *   3. Export a typed helper function (e.g. formatMagicItemForScriptorium)
 */

import type { Npc } from "@/types/npc.types";
import type { Monster } from "@/types/monster.types";
import type { Spell } from "@/types/spell.types";
import { spellLevelLabel } from "@/types/spell.types";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import type { ScriptoriumDocType } from "@/types/scriptorium.types";

// ── Output type ───────────────────────────────────────────────────────────────

export interface ScriptoriumImportData {
  title: string;
  content: string; // HTML string — Tiptap editor accepts HTML as fallback
  doc_type: ScriptoriumDocType;
  tags: string[];
  is_published: boolean;
  word_count: number;
}

// ── Formatter interface ───────────────────────────────────────────────────────

export interface AssetFormatter<T> {
  format(asset: T): ScriptoriumImportData;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

function abilityMod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function traitList(traits: Array<{ name: string; description: string }>): string {
  return traits.map((t) => `<p><strong>${t.name}.</strong> ${t.description}</p>`).join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function uniqueTags(...groups: (string | null | undefined)[][]): string[] {
  const flat = groups.flat().filter((t): t is string => !!t && t.trim().length > 0);
  return [...new Set(flat.map((t) => t.toLowerCase().trim()))];
}

// ── NPC formatter ─────────────────────────────────────────────────────────────

const npcFormatter: AssetFormatter<Npc> = {
  format(npc: Npc): ScriptoriumImportData {
    let html = "";

    // Portrait image (floated right in the document)
    if (npc.portrait_url) {
      html += `<img src="${npc.portrait_url}" alt="${npc.name}" width="200" style="float:right;margin:0 0 10px 14px;width:200px" />\n`;
    }

    // Name heading
    html += `<h1>${npc.name}</h1>\n`;

    // Subtitle line (race + class)
    const subtitle = [npc.race, npc.class].filter(Boolean).join(", ");
    if (subtitle) html += `<p><em>${subtitle}</em></p>\n`;

    // Identity block
    const identityRows = [
      npc.alignment && `<strong>Alignment</strong> ${npc.alignment}`,
      npc.age && `<strong>Age</strong> ${npc.age}`,
      npc.occupation && `<strong>Occupation</strong> ${npc.occupation}`,
      npc.location && `<strong>Location</strong> ${npc.location}`,
      npc.affiliation && `<strong>Affiliation</strong> ${npc.affiliation}`,
    ].filter(Boolean) as string[];

    if (identityRows.length) {
      html += "<h2>Identity</h2>\n";
      identityRows.forEach((row) => {
        html += `<p>${row}</p>\n`;
      });
    }

    // Lore sections
    const loreSections: { label: string; value: string | null }[] = [
      { label: "Appearance", value: npc.appearance },
      { label: "Personality", value: npc.personality },
      { label: "Backstory", value: npc.backstory },
      { label: "Notes", value: npc.notes },
    ];
    const loreItems = loreSections.filter((s) => s.value);
    if (loreItems.length) {
      html += "<h2>Lore</h2>\n";
      loreItems.forEach(({ label, value }) => {
        html += `<h3>${label}</h3>\n<p>${value}</p>\n`;
      });
    }

    // DM Secret (blockquote — visible but clearly marked)
    if (npc.secret) {
      html += `<h2>DM Notes</h2>\n<blockquote><p><strong>Secret:</strong> ${npc.secret}</p></blockquote>\n`;
    }

    // Stat block
    if (npc.stat_block) {
      const sb = npc.stat_block;
      html += "<h1>Statistics</h1>\n";
      html += `<p><strong>AC</strong> ${sb.armor_class} &nbsp; <strong>HP</strong> ${sb.hit_points} &nbsp; <strong>Speed</strong> ${sb.speed} &nbsp; <strong>CR</strong> ${sb.challenge_rating}</p>\n`;

      // Ability scores
      html += "<p>";
      const abilities: [string, number][] = [
        ["STR", sb.str],
        ["DEX", sb.dex],
        ["CON", sb.con],
        ["INT", sb.int],
        ["WIS", sb.wis],
        ["CHA", sb.cha],
      ];
      html += abilities
        .map(([label, score]) => `<strong>${label}</strong> ${score} (${abilityMod(score)})`)
        .join(" &nbsp; ");
      html += "</p>\n";

      if (sb.skills && Object.keys(sb.skills).length) {
        const skillsStr = Object.entries(sb.skills)
          .map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`)
          .join(", ");
        html += `<p><strong>Skills</strong> ${skillsStr}</p>\n`;
      }
      if (sb.senses) html += `<p><strong>Senses</strong> ${sb.senses}</p>\n`;
      if (sb.languages) html += `<p><strong>Languages</strong> ${sb.languages}</p>\n`;
      if (sb.damage_resistances)
        html += `<p><strong>Damage Resistances</strong> ${sb.damage_resistances}</p>\n`;
      if (sb.damage_immunities)
        html += `<p><strong>Damage Immunities</strong> ${sb.damage_immunities}</p>\n`;
      if (sb.condition_immunities)
        html += `<p><strong>Condition Immunities</strong> ${sb.condition_immunities}</p>\n`;

      if (sb.special_abilities?.length)
        html += "<h2>Special Abilities</h2>\n" + traitList(sb.special_abilities);
      if (sb.actions?.length) html += "<h2>Actions</h2>\n" + traitList(sb.actions);
      if (sb.legendary_actions?.length)
        html += "<h2>Legendary Actions</h2>\n" + traitList(sb.legendary_actions);
    }

    return {
      title: npc.name,
      content: html,
      doc_type: "npc-sheet",
      tags: uniqueTags(["npc"], npc.tags, [npc.race]),
      is_published: false,
      word_count: countWords(html),
    };
  },
};

// ── Monster formatter ─────────────────────────────────────────────────────────

const monsterFormatter: AssetFormatter<Monster> = {
  format(monster: Monster): ScriptoriumImportData {
    const sb = monster.stat_block;
    let html = "";

    // Name heading
    html += `<h1>${monster.name}</h1>\n`;

    // Type line
    const typeParts = [
      capitalize(monster.size),
      capitalize(monster.monster_type),
      monster.alignment,
    ].filter(Boolean);
    html += `<p><em>${typeParts.join(" ")}</em></p>\n`;

    // Combat stats
    html += `<p><strong>Armor Class</strong> ${sb.armor_class} &nbsp; <strong>Hit Points</strong> ${sb.hit_points} &nbsp; <strong>Speed</strong> ${sb.speed} &nbsp; <strong>Challenge</strong> ${sb.challenge_rating}</p>\n`;

    // Ability scores
    html += "<p>";
    const abilities: [string, number][] = [
      ["STR", sb.str],
      ["DEX", sb.dex],
      ["CON", sb.con],
      ["INT", sb.int],
      ["WIS", sb.wis],
      ["CHA", sb.cha],
    ];
    html += abilities
      .map(([label, score]) => `<strong>${label}</strong> ${score} (${abilityMod(score)})`)
      .join(" &nbsp; ");
    html += "</p>\n";

    // Proficiency block
    if (sb.saving_throws) html += `<p><strong>Saving Throws</strong> ${sb.saving_throws}</p>\n`;
    if (sb.skills && Object.keys(sb.skills).length) {
      html += `<p><strong>Skills</strong> ${Object.entries(sb.skills)
        .map(([k, v]) => `${k} ${v}`)
        .join(", ")}</p>\n`;
    }
    if (sb.damage_vulnerabilities)
      html += `<p><strong>Damage Vulnerabilities</strong> ${sb.damage_vulnerabilities}</p>\n`;
    if (sb.damage_resistances)
      html += `<p><strong>Damage Resistances</strong> ${sb.damage_resistances}</p>\n`;
    if (sb.damage_immunities)
      html += `<p><strong>Damage Immunities</strong> ${sb.damage_immunities}</p>\n`;
    if (sb.condition_immunities)
      html += `<p><strong>Condition Immunities</strong> ${sb.condition_immunities}</p>\n`;
    if (sb.senses) html += `<p><strong>Senses</strong> ${sb.senses}</p>\n`;
    if (sb.languages) html += `<p><strong>Languages</strong> ${sb.languages}</p>\n`;

    // Trait sections
    if (sb.special_abilities?.length)
      html += "<h2>Special Abilities</h2>\n" + traitList(sb.special_abilities);
    if (sb.actions?.length) html += "<h2>Actions</h2>\n" + traitList(sb.actions);
    if (sb.bonus_actions?.length) html += "<h2>Bonus Actions</h2>\n" + traitList(sb.bonus_actions);
    if (sb.reactions?.length) html += "<h2>Reactions</h2>\n" + traitList(sb.reactions);

    // Legendary
    const hasLegendary =
      (sb.legendary_resistance ?? 0) > 0 || (sb.legendary_actions?.length ?? 0) > 0;
    if (hasLegendary) {
      html += "<h1>Legendary</h1>\n";
      if (sb.legendary_resistance) {
        html += `<p><strong>Legendary Resistance (${sb.legendary_resistance}/Day).</strong> If ${monster.name} fails a saving throw, it can choose to succeed instead.</p>\n`;
      }
      if (sb.legendary_actions?.length)
        html += "<h2>Legendary Actions</h2>\n" + traitList(sb.legendary_actions);
    }

    if (sb.lair_actions?.length) {
      html += "<h1>Lair Actions</h1>\n" + traitList(sb.lair_actions);
    }

    if (monster.notes) {
      html += `<h2>DM Notes</h2>\n<blockquote><p>${monster.notes}</p></blockquote>\n`;
    }

    return {
      title: monster.name,
      content: html,
      doc_type: "monster",
      tags: uniqueTags(["monster"], [monster.monster_type], monster.tags, [monster.source]),
      is_published: false,
      word_count: countWords(html),
    };
  },
};

// ── Spell formatter ───────────────────────────────────────────────────────────

const spellFormatter: AssetFormatter<Spell> = {
  format(spell: Spell): ScriptoriumImportData {
    let html = "";

    // Name heading
    html += `<h1>${spell.name}</h1>\n`;

    // Type line: "3rd-Level Evocation · Ritual"
    let typeLine = `${spellLevelLabel(spell.level)} ${capitalize(spell.school)}`;
    if (spell.ritual) typeLine += " · Ritual";
    html += `<p><em>${typeLine}</em></p>\n`;

    // Stat block properties
    const castingTime =
      spell.casting_time === "Special" && spell.casting_time_custom
        ? spell.casting_time_custom
        : spell.casting_time;
    const range =
      spell.range === "Special" && spell.range_custom ? spell.range_custom : spell.range;
    const duration =
      spell.duration === "Special" && spell.duration_custom
        ? spell.duration_custom
        : spell.duration;

    html += `<p><strong>Casting Time</strong> ${castingTime}</p>\n`;
    html += `<p><strong>Range</strong> ${range}</p>\n`;

    const compStr = spell.components.join(", ");
    const materialStr =
      spell.components.includes("M") && spell.material ? ` (${spell.material})` : "";
    html += `<p><strong>Components</strong> ${compStr}${materialStr}</p>\n`;

    const durStr = spell.concentration ? `Concentration, ${duration}` : duration;
    html += `<p><strong>Duration</strong> ${durStr}</p>\n`;

    // Description
    if (spell.description) {
      html += `<p>${spell.description.replace(/\n/g, "</p>\n<p>")}</p>\n`;
    }

    // At Higher Levels
    if (spell.higher_levels) {
      html += `<h2>At Higher Levels</h2>\n<p>${spell.higher_levels}</p>\n`;
    }

    // Classes
    if (spell.classes.length) {
      html += `<p><strong>Spell Lists</strong> ${spell.classes.join(", ")}</p>\n`;
    }

    const tags = uniqueTags(
      ["spell"],
      [spell.school],
      spell.classes.map((c) => c.toLowerCase()),
      spell.tags,
      spell.source ? [spell.source] : [],
    );

    return {
      title: spell.name,
      content: html,
      doc_type: "spell",
      tags,
      is_published: false,
      word_count: countWords(html),
    };
  },
};

// ── Item formatter ────────────────────────────────────────────────────────────

const itemFormatter: AssetFormatter<{ item: Item; spells: Spell[] }> = {
  format({ item, spells }): ScriptoriumImportData {
    let html = "";

    if (item.image_url) {
      html += `<img src="${item.image_url}" alt="${item.name}" width="200" style="float:right;margin:0 0 10px 14px;width:200px" />\n`;
    }

    html += `<h1>${item.name}</h1>\n`;

    // Type line
    const rarity = ITEM_RARITY_LABELS[item.rarity];
    const type = ITEM_TYPE_LABELS[item.item_type];
    const typeLine = [rarity !== "Mundane" ? rarity : null, type, item.subtype]
      .filter(Boolean)
      .join(" · ");
    html += `<p><em>${typeLine}</em></p>\n`;

    // Physical stats
    const physRows = [
      item.cost && `<strong>Cost</strong> ${item.cost}`,
      item.weight && `<strong>Weight</strong> ${item.weight}`,
      item.damage_rolls?.length &&
        `<strong>Damage</strong> ${item.damage_rolls.map((r) => (r.type ? `${r.dice} ${r.type}` : r.dice)).join(" + ")}`,
      item.armor_class && `<strong>Armor Class</strong> ${item.armor_class}`,
      item.properties.length && `<strong>Properties</strong> ${item.properties.join(", ")}`,
    ].filter(Boolean) as string[];

    if (physRows.length) {
      physRows.forEach((row) => {
        html += `<p>${row}</p>\n`;
      });
    }

    // Magic properties
    if (item.rarity !== "mundane") {
      if (item.requires_attunement) {
        const req = item.attunement_requirements ? ` (${item.attunement_requirements})` : "";
        html += `<p><strong>Attunement</strong> Required${req}</p>\n`;
      }
      if (item.charges) {
        html += `<p><strong>Charges</strong> ${item.charges}${item.recharge ? ` · ${item.recharge}` : ""}</p>\n`;
      }
      if (spells.length) {
        html += `<p><strong>Spells</strong> ${spells.map((s) => `${s.name} (${spellLevelLabel(s.level)})`).join(", ")}</p>\n`;
      }
    }

    // Description
    if (item.description) {
      html += `<h2>Description</h2>\n`;
      item.description.split("\n\n").forEach((para) => {
        if (para.trim()) html += `<p>${para.trim()}</p>\n`;
      });
    }

    const tags = uniqueTags(
      ["item", item.item_type, item.rarity !== "mundane" ? "magic-item" : null],
      item.tags,
      item.source ? [item.source] : [],
    );

    return {
      title: item.name,
      content: html,
      doc_type: "item",
      tags,
      is_published: false,
      word_count: countWords(html),
    };
  },
};

// ── Registry ──────────────────────────────────────────────────────────────────
// Add new formatters here. Key = asset type identifier.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const FORMATTERS: Record<string, AssetFormatter<any>> = {
  npc: npcFormatter,
  monster: monsterFormatter,
  spell: spellFormatter,
  item: itemFormatter,
};

// Generic dispatch (for dynamic/plugin use cases)
export function formatForScriptorium<T>(type: string, asset: T): ScriptoriumImportData | null {
  const formatter = FORMATTERS[type] as AssetFormatter<T> | undefined;
  return formatter ? formatter.format(asset) : null;
}

// Typed convenience exports
export function formatNpcForScriptorium(npc: Npc): ScriptoriumImportData {
  return npcFormatter.format(npc);
}

export function formatMonsterForScriptorium(monster: Monster): ScriptoriumImportData {
  return monsterFormatter.format(monster);
}

export function formatSpellForScriptorium(spell: Spell): ScriptoriumImportData {
  return spellFormatter.format(spell);
}

export function formatItemForScriptorium(item: Item, spells: Spell[] = []): ScriptoriumImportData {
  return itemFormatter.format({ item, spells });
}

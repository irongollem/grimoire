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
import type { Location } from "@/types/location.types";
import { LOCATION_TYPE_LABELS } from "@/types/location.types";
import type { Quest, QuestObjective } from "@/types/quest.types";
import { QUEST_STATUS_LABELS } from "@/types/quest.types";
import type { ScriptoriumDocType, ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";

// ── Output type ───────────────────────────────────────────────────────────────

export interface ScriptoriumImportData {
  title: string;
  content: string; // HTML string — Tiptap editor accepts HTML as fallback
  doc_type: ScriptoriumDocType;
  tags: string[];
  is_published: boolean;
  is_two_column: boolean;
  theme: ScriptoriumTheme;
  page_size: ScriptoriumPageSize;
  ink_friendly: boolean;
  word_count: number;
  show_page_numbers: boolean;
  footer_text: string;
  page_number_start: number;
}

// ── Formatter interface ───────────────────────────────────────────────────────

export interface AssetFormatter<T> {
  format(asset: T, theme?: ScriptoriumTheme): ScriptoriumImportData;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/** CR string → XP award (D&D 5e / 2024 standard table). */
const CR_XP: Record<string, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100,
  "5": 1800, "6": 2300, "7": 2900, "8": 3900,
  "9": 5000, "10": 5900, "11": 7200, "12": 8400,
  "13": 10000, "14": 11500, "15": 13000, "16": 15000,
  "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000,
  "25": 75000, "26": 90000, "27": 105000, "28": 120000,
  "29": 135000, "30": 155000,
};

function crLabel(cr: string): string {
  const xp = CR_XP[cr];
  const xpStr = xp !== undefined ? ` (${xp.toLocaleString()} XP)` : "";
  return `CR ${cr}${xpStr}`;
}

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

/**
 * Parse a saving_throws string (e.g. "Dex +4, Wis +2") into a per-ability map.
 * Abilities not listed default to the plain ability modifier.
 */
function parseSaves(savingThrows: string | null, abs: [string, number][]): Record<string, string> {
  const saves: Record<string, string> = {};
  abs.forEach(([label, score]) => { saves[label] = abilityMod(score); });
  if (!savingThrows) return saves;
  const abbrev: Record<string, string> = {
    str: "STR", strength: "STR",
    dex: "DEX", dexterity: "DEX",
    con: "CON", constitution: "CON",
    int: "INT", intelligence: "INT",
    wis: "WIS", wisdom: "WIS",
    cha: "CHA", charisma: "CHA",
  };
  savingThrows.split(",").forEach((part) => {
    const m = part.trim().match(/^(\w+)\s*([+-]\d+)/i);
    if (m) {
      const key = abbrev[m[1].toLowerCase()];
      if (key) saves[key] = m[2];
    }
  });
  return saves;
}

/**
 * Render ability scores as a theme-appropriate table.
 *
 * Classic PHB 2014: single wide 2-row table — ability abbreviations in the
 *   header, "score (mod)" in the value row.
 *
 * OneDnD 2024: two 4-row × 4-column panels (STR/DEX/CON left, INT/WIS/CHA
 *   right) with Score / Mod / Save columns — matching the D&D Beyond 2024
 *   monster layout. Layout is fixed at import time (not reactive to theme
 *   toggle; reimport with the correct theme active to change it).
 */
function abilityScoresHtml(
  abs: [string, number][],
  savingThrows: string | null,
  theme: ScriptoriumTheme = "onednd2024",
): string {
  if (theme === "phb2014") {
    // ── Classic: 2-row 6-column table ────────────────────────────────────────
    const headers = abs.map(([l]) => `<th>${l}</th>`).join("");
    const values = abs.map(([, s]) => `<td>${s} (${abilityMod(s)})</td>`).join("");
    return `<table class="sc-ability-table sc-ability-table--classic"><thead><tr>${headers}</tr></thead><tbody><tr>${values}</tr></tbody></table>`;
  }

  // ── 2024: two 4-row panels inside one table (gap column in the middle) ─────
  // Header row uses <th> throughout; body rows use <td> throughout to avoid
  // mixed th/td per-row which ProseMirror normalises inconsistently.
  // Ability name cells in the body use class="sc-abil-name" on <td>.
  const saves = parseSaves(savingThrows, abs);
  const left = abs.slice(0, 3);   // STR, DEX, CON
  const right = abs.slice(3);     // INT, WIS, CHA
  const header = `<tr><th class="sc-abil-name"></th><th>Score</th><th>Mod</th><th>Save</th><th class="sc-abil-gap"></th><th class="sc-abil-name"></th><th>Score</th><th>Mod</th><th>Save</th></tr>`;
  const rows = left.map(([lL, sL], i) => {
    const [lR, sR] = right[i];
    const modL = abilityMod(sL); const modR = abilityMod(sR);
    return `<tr><td class="sc-abil-name">${lL}</td><td>${sL}</td><td>${modL}</td><td>${saves[lL]}</td><td class="sc-abil-gap"></td><td class="sc-abil-name">${lR}</td><td>${sR}</td><td>${modR}</td><td>${saves[lR]}</td></tr>`;
  }).join("");
  return `<table class="sc-ability-table sc-ability-table--2024"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
}

function traitList(traits: Array<{ name: string; description: string }>): string {
  return traits
    .map((t) => {
      const desc = t.description ?? "";
      // Trait descriptions may be stored as Tiptap JSON (from the rich-text editor)
      // or as plain text (Open5e imports before the RichTextEditor was adopted).
      if (desc.trimStart().startsWith("{")) {
        const bodyHtml = tiptapJsonToHtml(desc);
        // Merge the bold name into the first <p> so it reads as a single paragraph
        if (bodyHtml.startsWith("<p>")) {
          return bodyHtml.replace(/^<p>/, `<p><strong>${t.name}.</strong> `);
        }
        return `<p><strong>${t.name}.</strong></p>\n${bodyHtml}`;
      }
      return `<p><strong>${t.name}.</strong> ${desc}</p>`;
    })
    .join("\n");
}

/**
 * Render a rich-text field that may be stored as Tiptap JSON or plain text.
 * Falls back to a plain `<p>` wrapping if not valid JSON.
 */
function richTextOrPlain(value: string | null): string {
  if (!value) return "";
  if (value.trimStart().startsWith("{")) {
    return tiptapJsonToHtml(value) || `<p>${value}</p>\n`;
  }
  return `<p>${value}</p>\n`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function uniqueTags(...groups: (string | null | undefined)[][]): string[] {
  const flat = groups.flat().filter((t): t is string => !!t && t.trim().length > 0);
  return [...new Set(flat.map((t) => t.toLowerCase().trim()))];
}

// ── NPC formatter ─────────────────────────────────────────────────────────────

const npcFormatter: AssetFormatter<{ npc: Npc; locationName?: string | null }> = {
  format({ npc, locationName }, theme: ScriptoriumTheme = "onednd2024"): ScriptoriumImportData {
    let html = "";

    // Portrait image (floated right in the document)
    if (npc.portrait_url) {
      html += `<img src="${npc.portrait_url}" alt="${npc.name}" width="200" style="float:right;margin:0 0 10px 14px;width:200px" />\n`;
    }

    // Name heading
    html += `<h1>${npc.name}</h1>\n`;

    // Subtitle line (race)
    if (npc.race) html += `<p><em>${npc.race}</em></p>\n`;

    // Identity block
    const identityRows = [
      npc.alignment && `<strong>Alignment</strong> ${npc.alignment}`,
      npc.age && `<strong>Age</strong> ${npc.age}`,
      npc.occupation && `<strong>Occupation</strong> ${npc.occupation}`,
      (npc.location_id && locationName) && `<strong>Location</strong> ${locationName}`,
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
        html += `<h3>${label}</h3>\n${richTextOrPlain(value)}`;
      });
    }

    // Stat block
    if (npc.stat_block) {
      const sb = npc.stat_block;
      html += "<h1>Statistics</h1>\n";
      html += `<p><strong>AC</strong> ${sb.armor_class}</p>\n`;
      html += `<p><strong>HP</strong> ${sb.hit_points}</p>\n`;
      html += `<p><strong>Speed</strong> ${sb.speed}</p>\n`;
      html += `<p>${crLabel(sb.challenge_rating)}</p>\n`;

      // Ability scores — theme-appropriate table (fixed at import time)
      {
        const abs: [string, number][] = [
          ["STR", sb.str], ["DEX", sb.dex], ["CON", sb.con],
          ["INT", sb.int], ["WIS", sb.wis], ["CHA", sb.cha],
        ];
        html += abilityScoresHtml(abs, sb.saving_throws ?? null, theme) + "\n";
      }

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
      is_two_column: false,
      theme,
      page_size: "A4" as ScriptoriumPageSize,
      ink_friendly: false,
      word_count: countWords(html),
      show_page_numbers: false,
      footer_text: "",
      page_number_start: 1,
    };
  },
};

// ── Monster formatter ─────────────────────────────────────────────────────────

const monsterFormatter: AssetFormatter<Monster> = {
  format(monster: Monster, theme: ScriptoriumTheme = "onednd2024"): ScriptoriumImportData {
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

    // Portrait image (floated right)
    if (monster.image_url) {
      html += `<img src="${monster.image_url}" data-align="right" style="float:right;margin:0 0 10px 14px;width:180px;" alt="${monster.name}" />\n`;
    }

    // Combat stats — one per line, matching D&D Beyond 2024 layout
    html += `<p><strong>Armor Class</strong> ${sb.armor_class}</p>\n`;
    html += `<p><strong>Hit Points</strong> ${sb.hit_points}</p>\n`;
    html += `<p><strong>Speed</strong> ${sb.speed}</p>\n`;
    html += `<p>${crLabel(sb.challenge_rating)}</p>\n`;

    // Ability scores — theme-appropriate table (fixed at import time)
    {
      const abs: [string, number][] = [
        ["STR", sb.str], ["DEX", sb.dex], ["CON", sb.con],
        ["INT", sb.int], ["WIS", sb.wis], ["CHA", sb.cha],
      ];
      html += abilityScoresHtml(abs, sb.saving_throws ?? null, theme) + "\n";
    }

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

    if (monster.description) {
      html += "<h2>Description</h2>\n" + tiptapJsonToHtml(monster.description);
    }
    if (monster.notes) {
      const notesHtml = tiptapJsonToHtml(monster.notes) || `<p>${monster.notes}</p>\n`;
      html += "<h2>DM Notes</h2>\n" + notesHtml;
    }

    return {
      title: monster.name,
      content: html,
      doc_type: "monster",
      tags: uniqueTags(["monster"], [monster.monster_type], monster.tags, [monster.source]),
      is_published: false,
      is_two_column: false,
      theme,
      page_size: "A4" as ScriptoriumPageSize,
      ink_friendly: false,
      word_count: countWords(html),
      show_page_numbers: false,
      footer_text: "",
      page_number_start: 1,
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
      is_two_column: false,
      theme: "onednd2024" as ScriptoriumTheme,
      page_size: "A4" as ScriptoriumPageSize,
      ink_friendly: false,
      word_count: countWords(html),
      show_page_numbers: false,
      footer_text: "",
      page_number_start: 1,
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
      is_two_column: false,
      theme: "onednd2024" as ScriptoriumTheme,
      page_size: "A4" as ScriptoriumPageSize,
      ink_friendly: false,
      word_count: countWords(html),
      show_page_numbers: false,
      footer_text: "",
      page_number_start: 1,
    };
  },
};

// ── Location formatter ────────────────────────────────────────────────────────

/** Convert Tiptap JSON to basic HTML for Scriptorium rendering. */
function tiptapJsonToHtml(jsonStr: string | null): string {
  if (!jsonStr) return "";
  try {
    const doc = JSON.parse(jsonStr);
    function nodeToHtml(node: { type?: string; text?: string; marks?: { type: string }[]; content?: unknown[]; attrs?: Record<string, unknown> }): string {
      if (node.type === "text") {
        let t = (node.text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        if (node.marks) {
          for (const m of node.marks) {
            if (m.type === "bold") t = `<strong>${t}</strong>`;
            if (m.type === "italic") t = `<em>${t}</em>`;
          }
        }
        return t;
      }
      const inner = (node.content ?? []).map((c) => nodeToHtml(c as typeof node)).join("");
      switch (node.type) {
        case "paragraph":   return inner ? `<p>${inner}</p>\n` : "";
        case "heading":     return `<h${node.attrs?.level ?? 2}>${inner}</h${node.attrs?.level ?? 2}>\n`;
        case "bulletList":  return `<ul>${inner}</ul>\n`;
        case "orderedList": return `<ol>${inner}</ol>\n`;
        case "listItem":    return `<li>${inner}</li>`;
        case "blockquote":  return `<blockquote>${inner}</blockquote>\n`;
        case "hardBreak":   return "<br />";
        default:            return inner;
      }
    }
    return (doc.content ?? []).map((n: unknown) => nodeToHtml(n as Parameters<typeof nodeToHtml>[0])).join("");
  } catch {
    return "";
  }
}

const locationFormatter: AssetFormatter<Location> = {
  format(loc: Location): ScriptoriumImportData {
    let html = `<h1>${loc.name}</h1>\n`;
    html += `<p><em>${LOCATION_TYPE_LABELS[loc.location_type]}</em></p>\n`;
    if (loc.description) {
      const body = tiptapJsonToHtml(loc.description);
      if (body) html += body;
    }
    if (loc.notes) {
      html += `<h2>Notes</h2>\n<p>${loc.notes.replace(/\n/g, " ")}</p>\n`;
    }

    const tags = uniqueTags(["location", loc.location_type], loc.tags);
    return {
      title: loc.name,
      content: html,
      doc_type: "location",
      tags,
      is_published: false,
      is_two_column: false,
      theme: "onednd2024" as ScriptoriumTheme,
      page_size: "A4" as ScriptoriumPageSize,
      ink_friendly: false,
      word_count: countWords(html),
      show_page_numbers: false,
      footer_text: "",
      page_number_start: 1,
    };
  },
};

// ── Quest formatter ───────────────────────────────────────────────────────────

const questFormatter: AssetFormatter<{
  quest: Quest;
  objectives: QuestObjective[];
  giverName?: string | null;
  locationName?: string | null;
}> = {
  format({ quest, objectives, giverName, locationName }): ScriptoriumImportData {
    let html = `<h1>${quest.title}</h1>\n`;

    // Status + type line
    html += `<p><em>${QUEST_STATUS_LABELS[quest.status]}</em></p>\n`;

    // Meta block
    const metaRows = [
      giverName && `<strong>Quest Giver</strong> ${giverName}`,
      locationName && `<strong>Location</strong> ${locationName}`,
      quest.started_at && `<strong>Started</strong> ${quest.started_at.slice(0, 10)}`,
      quest.resolved_at && `<strong>Resolved</strong> ${quest.resolved_at.slice(0, 10)}`,
      quest.rewards && `<strong>Rewards</strong> ${quest.rewards}`,
    ].filter(Boolean) as string[];

    if (metaRows.length) {
      metaRows.forEach((row) => { html += `<p>${row}</p>\n`; });
    }

    // Summary
    if (quest.summary) {
      html += `<h2>Summary</h2>\n<p>${quest.summary}</p>\n`;
    }

    // Objectives
    if (objectives.length) {
      html += `<h2>Objectives</h2>\n<ul>\n`;
      objectives.forEach((obj) => {
        const done = obj.is_done ? " ✓" : "";
        html += `<li>${obj.description}${done}</li>\n`;
      });
      html += `</ul>\n`;
    }

    // Notes (Tiptap JSON)
    if (quest.notes) {
      const notesHtml = tiptapJsonToHtml(quest.notes);
      if (notesHtml) {
        html += `<h2>Notes</h2>\n${notesHtml}`;
      }
    }

    return {
      title: quest.title,
      content: html,
      doc_type: "quest",
      tags: uniqueTags(["quest", quest.status], quest.tags),
      is_published: false,
      is_two_column: false,
      theme: "onednd2024" as ScriptoriumTheme,
      page_size: "A4" as ScriptoriumPageSize,
      ink_friendly: false,
      word_count: countWords(html),
      show_page_numbers: false,
      footer_text: "",
      page_number_start: 1,
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
  location: locationFormatter,
  quest: questFormatter,
};

// Generic dispatch (for dynamic/plugin use cases)
export function formatForScriptorium<T>(type: string, asset: T): ScriptoriumImportData | null {
  const formatter = FORMATTERS[type] as AssetFormatter<T> | undefined;
  return formatter ? formatter.format(asset) : null;
}

// Typed convenience exports
export function formatNpcForScriptorium(
  npc: Npc,
  locationName?: string | null,
  theme: ScriptoriumTheme = "onednd2024",
): ScriptoriumImportData {
  return npcFormatter.format({ npc, locationName }, theme);
}

export function formatMonsterForScriptorium(
  monster: Monster,
  theme: ScriptoriumTheme = "onednd2024",
): ScriptoriumImportData {
  return monsterFormatter.format(monster, theme);
}

export function formatSpellForScriptorium(spell: Spell): ScriptoriumImportData {
  return spellFormatter.format(spell);
}

export function formatItemForScriptorium(item: Item, spells: Spell[] = []): ScriptoriumImportData {
  return itemFormatter.format({ item, spells });
}

export function formatLocationForScriptorium(location: Location): ScriptoriumImportData {
  return locationFormatter.format(location);
}

export function formatQuestForScriptorium(
  quest: Quest,
  objectives: QuestObjective[] = [],
  giverName?: string | null,
  locationName?: string | null,
): ScriptoriumImportData {
  return questFormatter.format({ quest, objectives, giverName, locationName });
}

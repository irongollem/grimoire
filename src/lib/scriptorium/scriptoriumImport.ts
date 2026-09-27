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

/** Escape the four HTML-significant characters in a plain-text value before
 *  interpolating it into an assembled HTML string. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function countWords(html: string): number {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.split(" ").length : 0;
}

function abilityModNumber(score: number): number {
  return Math.floor((score - 10) / 2);
}

// A true minus sign (U+2212), not a hyphen — the typographically correct
// glyph for a negative modifier in a printed stat block.
function abilityMod(score: number): string {
  const m = abilityModNumber(score);
  return m >= 0 ? `+${m}` : `−${Math.abs(m)}`;
}

function titleCaseWord(w: string): string {
  return w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w;
}

/** "chaotic neutral" / "CHAOTIC NEUTRAL" → "Chaotic Neutral". */
function titleCase(s: string): string {
  return s.split(/\s+/).filter(Boolean).map(titleCaseWord).join(" ");
}

/** "stealth" / "sleight_of_hand" → "Stealth" / "Sleight Of Hand". */
function skillLabel(key: string): string {
  return key.split(/[_\s]+/).filter(Boolean).map(titleCaseWord).join(" ");
}

/**
 * "Small aberration, chaotic evil" — size + creature type + alignment, title
 * cased throughout to match how D&D Beyond prints both editions' stat blocks
 * (verified against the 2014 and 2024 reference pages, #915 story 6) rather
 * than the mixed capitalisation the raw `monster_type`/`alignment` fields
 * happen to be stored in.
 */
function statBlockTypeLine(size: string, creatureType: string, alignment: string | null | undefined): string {
  const base = titleCase(`${size} ${creatureType}`.trim());
  return alignment ? `${base}, ${titleCase(alignment)}` : base;
}

/** "Initiative +5 (15)" — the flat 2024 initiative line: bonus + passive (10 + bonus). */
function initiativeLine(dex: number, explicitBonus?: number | null): string {
  const mod = explicitBonus ?? abilityModNumber(dex);
  const sign = mod >= 0 ? `+${mod}` : `−${Math.abs(mod)}`;
  return `${sign} (${10 + mod})`;
}

/** Standard 5e proficiency-bonus-by-CR table, used when a stat block doesn't store its own. */
function crProficiencyBonus(cr: string): number {
  if (cr.includes("/")) return 2;
  const n = parseInt(cr, 10);
  if (Number.isNaN(n)) return 2;
  if (n <= 4) return 2;
  if (n <= 8) return 3;
  if (n <= 12) return 4;
  if (n <= 16) return 5;
  if (n <= 20) return 6;
  if (n <= 24) return 7;
  if (n <= 28) return 8;
  return 9;
}

/**
 * The Challenge/CR property line — themed, per the D&D Beyond reference pages:
 * phb2014 prints "Challenge 3 (700 XP)" and a separate "Proficiency Bonus +N"
 * line side by side; onednd2024 prints the compact "CR 3 (XP 700; PB +2)".
 */
function challengeLineHtml(cr: string, explicitPb: number | undefined, theme: ScriptoriumTheme): string {
  const xp = CR_XP[cr];
  const pb = explicitPb ?? crProficiencyBonus(cr);
  if (theme === "phb2014") {
    const xpStr = xp !== undefined ? ` (${xp.toLocaleString()} XP)` : "";
    return (
      `<p class="sc-statblock-prop sc-statblock-cr">` +
      `<span><strong>Challenge</strong> ${cr}${xpStr}</span>` +
      `<span><strong>Proficiency Bonus</strong> +${pb}</span>` +
      `</p>\n`
    );
  }
  const bits = [xp !== undefined ? `XP ${xp.toLocaleString()}` : null, `PB +${pb}`]
    .filter((b): b is string => b !== null)
    .join("; ");
  return `<p class="sc-statblock-prop"><strong>CR</strong> ${cr}${bits ? ` (${bits})` : ""}</p>\n`;
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

  // ── 2024: two 3-row panels side by side (gap column in the middle) ─────────
  // Physical (STR/DEX/CON) and mental (INT/WIS/CHA) each get their own
  // name/score/mod/save cells, classed .sc-abil-physical / .sc-abil-mental so
  // the theme CSS can tint each panel a different muted hue (never a
  // saturated fill — see theme-onednd2024.css). Header row uses <th>
  // throughout; body rows use <td> throughout, to avoid mixed th/td per row,
  // which ProseMirror normalises inconsistently.
  const saves = parseSaves(savingThrows, abs);
  const left = abs.slice(0, 3);   // STR, DEX, CON
  const right = abs.slice(3);     // INT, WIS, CHA
  const header =
    `<tr>` +
    `<th class="sc-abil-name sc-abil-physical"></th>` +
    `<th class="sc-abil-score sc-abil-physical"></th>` +
    `<th class="sc-abil-mod sc-abil-physical">Mod</th>` +
    `<th class="sc-abil-save sc-abil-physical">Save</th>` +
    `<th class="sc-abil-gap"></th>` +
    `<th class="sc-abil-name sc-abil-mental"></th>` +
    `<th class="sc-abil-score sc-abil-mental"></th>` +
    `<th class="sc-abil-mod sc-abil-mental">Mod</th>` +
    `<th class="sc-abil-save sc-abil-mental">Save</th>` +
    `</tr>`;
  const rows = left.map(([lL, sL], i) => {
    const [lR, sR] = right[i];
    return (
      `<tr>` +
      `<td class="sc-abil-name sc-abil-physical">${lL}</td>` +
      `<td class="sc-abil-score sc-abil-physical">${sL}</td>` +
      `<td class="sc-abil-mod sc-abil-physical">${abilityMod(sL)}</td>` +
      `<td class="sc-abil-save sc-abil-physical">${saves[lL]}</td>` +
      `<td class="sc-abil-gap"></td>` +
      `<td class="sc-abil-name sc-abil-mental">${lR}</td>` +
      `<td class="sc-abil-score sc-abil-mental">${sR}</td>` +
      `<td class="sc-abil-mod sc-abil-mental">${abilityMod(sR)}</td>` +
      `<td class="sc-abil-save sc-abil-mental">${saves[lR]}</td>` +
      `</tr>`
    );
  }).join("");
  return `<table class="sc-ability-table sc-ability-table--2024"><thead>${header}</thead><tbody>${rows}</tbody></table>`;
}

// ── Linked entity stat block frame (#915 story 6) ────────────────────────────
//
// Shared by the NPC and monster formatters: one framed block whose own name
// is the block's title (never a document h1/h2, which the TOC and the
// two-column chapter styles would otherwise pick up — see pagedToc.ts and
// theme-base.css's .sc-cover/.sc-note h1 resets for the same class of bug),
// a themed AC/Initiative-or-Armor-Class line, the ability table above, the
// property lines, the Challenge/CR line, and labelled trait/action sections
// (h4, likewise excluded from the TOC and the chapter heading styles).

export interface StatBlockTraitItem {
  name: string;
  description: string;
}

interface StatBlockSection {
  label: string;
  items: StatBlockTraitItem[];
  /** Extra HTML rendered before the item list (e.g. a Legendary Resistance blurb). */
  intro?: string;
}

interface StatBlockAbilities {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export type StatBlockSize = "column" | "wide";

interface BuildStatBlockOpts {
  /** A visible entry heading sits above the frame (the creature has lore),
   *  which takes room from the column the block must fit in. */
  headingAbove?: boolean;
  /** The block's own title. Empty string omits the type line entirely (used
   *  for an NPC's generic "Statistics" frame, which has no size/type/alignment). */
  name: string;
  typeLine: string;
  theme: ScriptoriumTheme;
  armorClass: number;
  hitPoints: string;
  speed: string;
  abilities: StatBlockAbilities;
  initiativeOverride?: number | null;
  savingThrows?: string | null;
  proficiencyBonus?: number;
  challengeRating: string;
  skills?: Record<string, string>;
  damageVulnerabilities?: string;
  damageResistances?: string;
  damageImmunities?: string;
  conditionImmunities?: string;
  senses?: string;
  languages?: string;
  sections: StatBlockSection[];
}

/**
 * Build the stat block's own content — everything the reader sees inside the
 * frame — WITHOUT the outer `.sc-statblock sc-statblock--SIZE` wrapper. Split
 * out from `buildStatBlockHtml()` so the size decision (below) can measure
 * this exact string before it's known which size class to wrap it in, rather
 * than duplicating the property-line/section assembly in a separate estimator
 * that could drift from what actually renders.
 */
function buildStatBlockInnerHtml(opts: Omit<BuildStatBlockOpts, "theme"> & { theme: ScriptoriumTheme }): string {
  const {
    name, typeLine, theme, armorClass, hitPoints, speed, abilities,
    initiativeOverride, savingThrows, proficiencyBonus, challengeRating,
    skills, damageVulnerabilities, damageResistances, damageImmunities,
    conditionImmunities, senses, languages, sections,
  } = opts;

  let html = `<p class="sc-statblock-name">${name}</p>\n`;
  html += `<div class="sc-statblock-rule"></div>\n`;
  if (typeLine) html += `<p class="sc-statblock-type"><em>${typeLine}</em></p>\n`;

  if (theme === "phb2014") {
    html += `<p class="sc-statblock-prop"><strong>Armor Class</strong> ${armorClass}</p>\n`;
    html += `<p class="sc-statblock-prop"><strong>Hit Points</strong> ${hitPoints}</p>\n`;
    html += `<p class="sc-statblock-prop"><strong>Speed</strong> ${speed}</p>\n`;
  } else {
    const init = initiativeLine(abilities.dex, initiativeOverride);
    html +=
      `<p class="sc-statblock-prop sc-statblock-acinit">` +
      `<span><strong>AC</strong> ${armorClass}</span>` +
      `<span><strong>Initiative</strong> ${init}</span>` +
      `</p>\n`;
    html += `<p class="sc-statblock-prop"><strong>HP</strong> ${hitPoints}</p>\n`;
    html += `<p class="sc-statblock-prop"><strong>Speed</strong> ${speed}</p>\n`;
  }

  const abs: [string, number][] = [
    ["STR", abilities.str], ["DEX", abilities.dex], ["CON", abilities.con],
    ["INT", abilities.int], ["WIS", abilities.wis], ["CHA", abilities.cha],
  ];
  html += abilityScoresHtml(abs, savingThrows ?? null, theme) + "\n";

  // 2024 never prints a separate Saving Throws line — every ability's own
  // Save is already a column in the ability table above. 2014's table has no
  // such column, so it still needs the explicit line (#915 story 6 round 2).
  if (theme === "phb2014" && savingThrows)
    html += `<p class="sc-statblock-prop"><strong>Saving Throws</strong> ${savingThrows}</p>\n`;
  if (skills && Object.keys(skills).length) {
    const skillsStr = Object.entries(skills)
      .map(([k, v]) => `${skillLabel(k)} ${v}`)
      .join(", ");
    html += `<p class="sc-statblock-prop"><strong>Skills</strong> ${skillsStr}</p>\n`;
  }
  if (damageVulnerabilities)
    html += `<p class="sc-statblock-prop"><strong>Damage Vulnerabilities</strong> ${damageVulnerabilities}</p>\n`;
  if (damageResistances)
    html += `<p class="sc-statblock-prop"><strong>Damage Resistances</strong> ${damageResistances}</p>\n`;
  if (damageImmunities)
    html += `<p class="sc-statblock-prop"><strong>Damage Immunities</strong> ${damageImmunities}</p>\n`;
  if (conditionImmunities)
    html += `<p class="sc-statblock-prop"><strong>Condition Immunities</strong> ${conditionImmunities}</p>\n`;
  if (senses) html += `<p class="sc-statblock-prop"><strong>Senses</strong> ${senses}</p>\n`;
  if (languages) html += `<p class="sc-statblock-prop"><strong>Languages</strong> ${languages}</p>\n`;

  html += challengeLineHtml(challengeRating, proficiencyBonus, theme);

  sections.forEach((section) => {
    html += `<div class="sc-statblock-section">`;
    html += `<h4 class="sc-statblock-section-title">${section.label}</h4>\n`;
    if (section.intro) html += section.intro + "\n";
    html += traitList(section.items);
    html += `</div>\n`;
  });

  return html;
}

/*
 * A stat block above this many TEXT characters (tags stripped) is taller than
 * one A4 column can hold at this font size and needs to go "wide" — a band
 * spanning both page columns with its own internal two-column flow — rather
 * than staying "column" sized, which relied on a Paged.js column-break to
 * place it and, before this size decision existed, on entry COUNT rather than
 * actual length (#915 story 6 round 2).
 *
 * Text length, not the assembled HTML's length, is what's measured: the same
 * six creatures' stat blocks run 1882–4604 HTML characters depending on
 * theme (2024's extra table markup for the AC/Initiative line and two tinted
 * ability panels roughly doubles it over 2014's plainer markup) but only
 * 854–1871 TEXT characters regardless of theme — the two themes print
 * materially the same words, so text length is the theme-agnostic proxy for
 * rendered height that HTML length can't be.
 *
 * Calibrated against the Sugarwell booklet's six creatures (measured against
 * production data, #915 story 6 round 2):
 *   Spun Glass Hound   854 (2024) / 859 (2014) — fits a column, fine as-is
 *   Brittle Knight     923 / 918                — fits a column, fine as-is
 *   Marzipan Sentry   1120 / 1116                — fits a column, fine as-is
 *   Toffee Maw        1304 / 1299                — the tallest column that
 *     still fits (measured 976px of a ~1013px column) — the round-1 bug here
 *     was never its SIZE, it was the column-break mechanism placing its art
 *     on an otherwise empty next page, which the new two-cell grid fixes
 *     without changing this creature's size at all.
 *   Candy Archer      1439 / 1434                — split its Actions across a
 *     page under the old entry-count threshold (6 items counted as "still
 *     fits"); needs "wide".
 *   Caramel Crusher   1871 / 1867                — same split-Actions bug,
 *     the longest of the six; needs "wide".
 *
 * 1,350 sits just above Toffee Maw (the top of what a column can actually
 * hold) and comfortably below Candy Archer (the shortest creature that
 * can't) — the gap between the two is wide enough that the exact number
 * matters less than being between them.
 */
const WIDE_STATBLOCK_CHAR_THRESHOLD = 1350;

/**
 * The same limit when the entry heading is VISIBLE above the block (the
 * creature has lore, so its name prints large above the frame). Measured on
 * the live booklet once lore rendered (26 Sep 2026): a column stat block
 * runs 0.73 to 0.87px of height per character, the page's content box is
 * about 1,014px, and the visible heading plus its gaps take about 75px, so
 * roughly 930px remain; 930 / 0.87 is about 1,070. At the old 1,350 the
 * Marzipan Sentry (1,116 characters) left a near-empty spill page and the
 * Toffee Maw (1,328) overflowed and Paged.js drew it twice. 1,050 keeps the
 * Spun Glass Hound (881) and Brittle Knight (918) in a column and sends the
 * other four wide.
 */
const WIDE_STATBLOCK_CHAR_THRESHOLD_UNDER_HEADING = 1050;

/** Strip tags and collapse whitespace to approximate the text a reader would
 *  actually see, for the size estimate above. */
function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function estimateStatBlockSize(innerHtml: string, headingAbove: boolean): StatBlockSize {
  const limit = headingAbove ? WIDE_STATBLOCK_CHAR_THRESHOLD_UNDER_HEADING : WIDE_STATBLOCK_CHAR_THRESHOLD;
  return textLength(innerHtml) > limit ? "wide" : "column";
}

/** Build the full framed stat block: decides its own size from the content
 *  (see `estimateStatBlockSize` above) and returns both the size it chose —
 *  the caller needs it to lay out the surrounding entry (#915 story 6 round
 *  2) — and the finished HTML, wrapped accordingly. */
function buildStatBlockHtml(opts: BuildStatBlockOpts): { html: string; size: StatBlockSize } {
  const inner = buildStatBlockInnerHtml(opts);
  const size = estimateStatBlockSize(inner, opts.headingAbove ?? false);
  return { html: `<div class="sc-statblock sc-statblock--${size}">\n${inner}</div>\n`, size };
}

function traitList(traits: Array<{ name: string; description: string }>): string {
  return traits
    .map((t) => {
      const desc = t.description ?? "";
      // Trait descriptions may be stored as Tiptap JSON (from the rich-text editor)
      // or as plain text (Open5e imports before the RichTextEditor was adopted).
      let html: string;
      if (desc.trimStart().startsWith("{")) {
        const bodyHtml = tiptapJsonToHtml(desc);
        // Merge the bold name into the first <p> so it reads as a single paragraph
        html = bodyHtml.startsWith("<p>")
          ? bodyHtml.replace(/^<p>/, `<p><strong>${t.name}.</strong> `)
          : `<p><strong>${t.name}.</strong></p>\n${bodyHtml}`;
      } else {
        html = `<p><strong>${t.name}.</strong> ${desc}</p>`;
      }
      return italicizeAttackRunins(html);
    })
    .join("\n");
}

/**
 * The attack/outcome run-ins both editions print in italics ("Melee Weapon
 * Attack:", "Hit:", …), wherever they land inside a trait/action's own
 * description text — CSS can't select on a text match, so this runs once
 * over the assembled HTML instead (#915 story 6 round 2). Longest phrase
 * first so "Melee or Ranged Weapon Attack:" isn't left partly un-italicised
 * by "Melee Weapon Attack:" matching a prefix of it first — none of the
 * others overlap this way, but the ordering costs nothing and removes the
 * question.
 */
const ATTACK_RUNIN_PHRASES = [
  "Melee or Ranged Weapon Attack:",
  "Melee Weapon Attack:",
  "Ranged Weapon Attack:",
  "Melee Spell Attack:",
  "Ranged Spell Attack:",
  "Melee Attack Roll:",
  "Ranged Attack Roll:",
  "Hit:",
  "Miss:",
  "Failure:",
  "Success:",
] as const;

const ATTACK_RUNIN_RE = new RegExp(
  `(?<!<em>)(${ATTACK_RUNIN_PHRASES.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`,
  "g",
);

function italicizeAttackRunins(html: string): string {
  return html.replace(ATTACK_RUNIN_RE, "<em>$1</em>");
}

/**
 * Render a rich-text field that may be stored as Tiptap JSON (the rich-text
 * editor's own shape) or plain text (an Open5e import, or older data typed
 * before a field had a rich-text editor at all — both shapes coexist in real
 * data, #915 story 6 round 2). Plain text is escaped before wrapping — this
 * used to interpolate it straight into the HTML string unescaped, which is
 * safe only by luck for content that happens to contain no `&`/`<`/`>`.
 */
function richTextOrPlain(value: string | null | undefined): string {
  if (!value) return "";
  if (value.trimStart().startsWith("{")) {
    try {
      JSON.parse(value);
      // A genuinely empty Tiptap doc (e.g. `{"type":"doc","content":[]}`, left
      // behind by a field that was opened and never filled in) correctly
      // converts to "" — that's "no lore", not a reason to fall back to
      // dumping the raw JSON string as text.
      return tiptapJsonToHtml(value);
    } catch {
      // Looked like JSON (starts with "{") but wasn't valid — treat the whole
      // value as plain text instead of silently producing nothing.
    }
  }
  return `<p>${escapeHtml(value)}</p>\n`;
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

    // Name heading
    html += `<h1>${npc.name}</h1>\n`;

    // Portrait — centered block (no float: float-wrap reads awkwardly next to
    // the short identity block, and floats are fragile across Paged.js breaks).
    if (npc.portrait_url) {
      html += `<img src="${npc.portrait_url}" alt="${npc.name}" width="240" style="display:block;margin:8px auto;width:240px" />\n`;
    }

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

    // Stat block — one framed block, its own title ("Statistics": an NPC has
    // no size/type/alignment triple the way a monster does, so there's no
    // type line to show), never a document h1/h2 (#915 story 6).
    if (npc.stat_block) {
      const sb = npc.stat_block;
      const sections: StatBlockSection[] = [];
      if (sb.special_abilities?.length) sections.push({ label: "Traits", items: sb.special_abilities });
      if (sb.actions?.length) sections.push({ label: "Actions", items: sb.actions });
      if (sb.bonus_actions?.length) sections.push({ label: "Bonus Actions", items: sb.bonus_actions });
      if (sb.reactions?.length) sections.push({ label: "Reactions", items: sb.reactions });
      if (sb.legendary_actions?.length)
        sections.push({ label: "Legendary Actions", items: sb.legendary_actions });
      if (sb.lair_actions?.length) sections.push({ label: "Lair Actions", items: sb.lair_actions });

      html += buildStatBlockHtml({
        name: "Statistics",
        typeLine: "",
        theme,
        armorClass: sb.armor_class,
        hitPoints: sb.hit_points,
        speed: sb.speed,
        abilities: { str: sb.str, dex: sb.dex, con: sb.con, int: sb.int, wis: sb.wis, cha: sb.cha },
        initiativeOverride: sb.initiative_bonus,
        savingThrows: sb.saving_throws ?? null,
        proficiencyBonus: sb.proficiency_bonus,
        challengeRating: sb.challenge_rating,
        skills: sb.skills,
        damageVulnerabilities: sb.damage_vulnerabilities,
        damageResistances: sb.damage_resistances,
        damageImmunities: sb.damage_immunities,
        conditionImmunities: sb.condition_immunities,
        senses: sb.senses,
        languages: sb.languages,
        sections,
      }).html;
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

    const sections: StatBlockSection[] = [];
    if (sb.special_abilities?.length) sections.push({ label: "Traits", items: sb.special_abilities });
    if (sb.actions?.length) sections.push({ label: "Actions", items: sb.actions });
    if (sb.bonus_actions?.length) sections.push({ label: "Bonus Actions", items: sb.bonus_actions });
    if (sb.reactions?.length) sections.push({ label: "Reactions", items: sb.reactions });

    const hasLegendary = (sb.legendary_resistance ?? 0) > 0 || (sb.legendary_actions?.length ?? 0) > 0;
    if (hasLegendary) {
      sections.push({
        label: "Legendary Actions",
        items: sb.legendary_actions ?? [],
        intro: sb.legendary_resistance
          ? `<p><strong>Legendary Resistance (${sb.legendary_resistance}/Day).</strong> If ${monster.name} fails a saving throw, it can choose to succeed instead.</p>`
          : undefined,
      });
    }
    if (sb.lair_actions?.length) sections.push({ label: "Lair Actions", items: sb.lair_actions });

    // A monster is rendered as a Monster Manual ENTRY, not just a stat block:
    // a real document heading (h2 — this one, unlike the block's own
    // sections, is meant to be in the TOC, exactly like a Monster Manual's
    // own creature-name entries), the framed stat block, and the creature's
    // lore and portrait. Round 1 sent the lore/art to a "spare" page column
    // via a manual `.sc-column-break`, which Paged.js doesn't honour
    // reliably (a tall stat block's art could spill onto an otherwise empty
    // next page). Round 2 replaces that with a deterministic layout: the
    // whole entry spans the page (`column-span: all`, same escape hatch a
    // cover or the TOC uses) and lays out its own CSS grid — nothing here
    // depends on where Paged.js decides to break the surrounding two-column
    // flow. See EntityEmbedView.vue for the size/art/lore/band toggles, and
    // theme-base.css's "Linked entity ENTRY layout" section for the grid.
    // Lore decides whether the entry heading shows, and a visible heading
    // shrinks the column the stat block must fit (see the size thresholds).
    const loreHtml = richTextOrPlain(monster.description);
    const hasLore = Boolean(loreHtml.trim());
    const { html: statBlockHtml, size } = buildStatBlockHtml({
      headingAbove: hasLore,
      name: monster.name,
      typeLine: statBlockTypeLine(monster.size, monster.monster_type, monster.alignment),
      theme,
      armorClass: sb.armor_class,
      hitPoints: sb.hit_points,
      speed: sb.speed,
      abilities: { str: sb.str, dex: sb.dex, con: sb.con, int: sb.int, wis: sb.wis, cha: sb.cha },
      initiativeOverride: sb.initiative_bonus,
      savingThrows: sb.saving_throws ?? null,
      proficiencyBonus: sb.proficiency_bonus,
      challengeRating: sb.challenge_rating,
      skills: sb.skills,
      damageVulnerabilities: sb.damage_vulnerabilities,
      damageResistances: sb.damage_resistances,
      damageImmunities: sb.damage_immunities,
      conditionImmunities: sb.condition_immunities,
      senses: sb.senses,
      languages: sb.languages,
      sections,
    });

    // The `sc-entity-art` class is a stable hook for resolveEntityEmbeds() to
    // remove this figure when a linked embed's `showArt` is off. It no longer
    // floats — the art now has its own grid cell (column size) or its own
    // full-width slot above/below the band (wide size), so a float would only
    // fight the layout that already places it.
    const artHtml = monster.image_url
      ? `<img src="${monster.image_url}" class="sc-entity-art" alt="${monster.name}" style="display:block;width:100%;max-width:220px;margin:0 auto 0.75rem;" />\n`
      : "";
    // A monster's description may be Tiptap JSON (the rich-text editor's own
    // shape) or plain text (an Open5e import, or older data typed before a
    // field had a rich-text editor at all) — both shapes exist in real data
    // (#915 story 6 round 2). richTextOrPlain() handles both and escapes the
    // plain-text case, unlike the direct tiptapJsonToHtml() call this used to
    // make, which silently produced nothing at all for a plain-text
    // description (JSON.parse threw, caught, returned "").

    // The entry heading duplicated the stat block's own name directly under
    // it when there was no lore to justify a second, larger name above the
    // frame (#915 story 6 round 2). With lore, both show — exactly like a
    // Monster Manual entry, whose page-top name is a different, larger
    // treatment than the stat block's own title. Without it, the heading
    // stays in the DOM (so it still enters the table of contents and the
    // phone reader's contents list — see pagedToc.ts / readerToc.ts) but is
    // visually hidden, leaving the frame's own name as the only visible one.
    const entryHeadingClass = hasLore
      ? "sc-statblock-entry-heading"
      : "sc-statblock-entry-heading sc-statblock-entry-heading--no-lore";
    const entryHeadingHtml = `<h2 class="${entryHeadingClass}">${monster.name}</h2>\n`;

    const asideHtml =
      artHtml || loreHtml
        ? `<div class="sc-statblock-entry-aside">${artHtml}<div class="sc-statblock-entry-lore">${loreHtml}</div></div>\n`
        : "";

    let html =
      `<div class="sc-statblock-entry sc-statblock-entry--${size}" data-band-position="top">\n` +
      entryHeadingHtml +
      `<div class="sc-statblock-entry-body">\n` +
      `<div class="sc-statblock-entry-block">\n${statBlockHtml}</div>\n` +
      asideHtml +
      `</div>\n</div>\n`;

    if (monster.notes) {
      html += "<h2>DM Notes</h2>\n" + richTextOrPlain(monster.notes);
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
        const done = obj.status === "complete" ? " ✓" : obj.status === "failed" ? " ✗" : "";
        html += `<li>${obj.description}${done}</li>\n`;
      });
      html += `</ul>\n`;
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

// ── Entity embed body HTML (#915 story 3) ────────────────────────────────────
//
// `entityEmbed` nodes and "Insert Asset" both need just the formatted body
// HTML for a CURRENT entity, not the full ScriptoriumImportData wrapper
// (title, tags, doc_type, word_count, …) the formatters above build for a
// whole new document. This is the one dispatch point for that — it calls the
// same formatter objects the typed exports above use, so there is exactly one
// place that knows how to turn each entity type into body HTML.

export type EntityEmbedType = "npc" | "monster" | "spell" | "item" | "location" | "quest";

export type EntityEmbedInput =
  | { type: "npc"; npc: Npc; locationName?: string | null }
  | { type: "monster"; monster: Monster }
  | { type: "spell"; spell: Spell }
  | { type: "item"; item: Item; spells: Spell[] }
  | { type: "location"; location: Location }
  | {
      type: "quest";
      quest: Quest;
      objectives: QuestObjective[];
      giverName?: string | null;
      locationName?: string | null;
    };

export function formatEntityEmbedBodyHtml(
  input: EntityEmbedInput,
  theme: ScriptoriumTheme = "onednd2024",
): string {
  switch (input.type) {
    case "npc":
      return npcFormatter.format({ npc: input.npc, locationName: input.locationName }, theme).content;
    case "monster":
      return monsterFormatter.format(input.monster, theme).content;
    case "spell":
      return spellFormatter.format(input.spell).content;
    case "item":
      return itemFormatter.format({ item: input.item, spells: input.spells }).content;
    case "location":
      return locationFormatter.format(input.location).content;
    case "quest":
      return questFormatter.format({
        quest: input.quest,
        objectives: input.objectives,
        giverName: input.giverName,
        locationName: input.locationName,
      }).content;
  }
}

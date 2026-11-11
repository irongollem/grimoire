/**
 * Scriptorium Block Registry
 *
 * Every block a writer can put on a page. The book kit (a tab beside Chapters)
 * and the "/" menu both read it: add an entry here and it shows up in both,
 * grouped by the `group` field. Page furniture (watercolour, watermark, artist
 * credit) is not here: it is placed from "Add to this page" in the panel.
 *
 * Groups are rendered in BLOCK_GROUP_ORDER; add new group names there.
 */

import type { Component } from "vue";
import type { Editor } from "@tiptap/core";
import { IconAnnotate, IconAward, IconBookMarked, IconBookmark, IconComment, IconGem, IconGenerate, IconInfo, IconLensPair, IconList, IconMaximize, IconMinus, IconMonster, IconMoveH, IconMoveV, IconNote, IconPopulate, IconQuote, IconRect, IconScrollText, IconSecret, IconSplitCell, IconTable, IconUserRound } from '@/lib/icons';
import {
  frontCoverTemplate,
  insideCoverTemplate,
  partDividerTemplate,
  backCoverTemplate,
} from "@/scriptorium/lib/coverTemplates";
import {
  fullCasterTable,
  halfCasterTable,
  thirdCasterTable,
  martialTable,
} from "@/scriptorium/lib/classTableTemplates";
import {
  monsterStatBlockTemplate,
  monsterStatBlockWideTemplate,
  spellTemplate,
  magicItemTemplate,
  classFeatureTemplate,
} from "@/scriptorium/lib/templates";

export interface BlockEntry {
  /** Which section this entry belongs to. */
  group: string;
  label: string;
  description: string;
  icon: Component;
  /**
   * The short name on a kit tile and the toolbar. An entry with one is a featured tile
   * (frame 13), shown first in the kit in KIT_TILE_ORDER.
   */
  kit?: string;
  /** One line for the "/" menu; falls back to the first sentence of `description`. */
  blurb?: string;
  /**
   * The entry works on the text at the caret (a drop cap, a spacer inside a paragraph, an
   * attribution inside a quote), so the kit does not give it a line of its own first.
   */
  inPlace?: boolean;
  /** Called with the focused editor when the user clicks the entry. */
  action?: (editor: Editor) => void;
  /**
   * When provided, the entry is greyed-out and unclickable if this returns
   * false. Use for state-dependent restrictions (e.g. column break only valid
   * in two-column mode). Do NOT use for "not implemented yet" — just omit the
   * entry until the feature ships.
   *
   * The optional `ctx` carries editor-external state (e.g. `isTwoColumn`)
   * that cannot be derived from the Tiptap editor instance alone.
   */
  enabled?: (editor: Editor, ctx?: { isTwoColumn?: boolean }) => boolean;
}

/** The featured tiles of the book kit, in the order frame 13 draws them. */
export const KIT_TILE_ORDER: readonly string[] = [
  "Read-aloud",
  "Sidebar",
  "Stat block",
  "Table",
  "Drop cap",
  "Wide",
  "Spell",
  "Magic item",
  "Bright / Deep",
  "Quote",
  "Page break",
];

/** Controls the display order of groups in the kit and the "/" menu. */
export const BLOCK_GROUP_ORDER: string[] = [
  "Text",
  "Cover Pages",
  "Layout",
  "Callouts",
  "Templates",
  "Structural",
];

/**
 * All registered block entries.
 *
 * To add a new entry from a parity ticket:
 *   1. Import whatever Tiptap command / node you need.
 *   2. Push (or splice) a new BlockEntry into this array.
 *   3. If you're introducing a new group, add it to BLOCK_GROUP_ORDER above.
 */
export const BLOCK_REGISTRY: BlockEntry[] = [
  // ── Text ─────────────────────────────────────────────────────────────────────
  {
    group: "Text",
    label: "Table",
    kit: "Table",
    blurb: "A plain table to fill in",
    description: "A three by three table with a header row. Tab moves between cells.",
    icon: IconTable,
    action: (editor) =>
      editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    group: "Text",
    label: "Drop cap",
    inPlace: true,
    kit: "Drop cap",
    blurb: "A large first letter on this paragraph",
    description:
      "Sets the first letter of this paragraph large, the way a book opens a chapter. Choose it again to take it off.",
    icon: IconAnnotate,
    action: (editor) => editor.chain().focus().toggleDropCap().run(),
  },

  // ── Cover Pages ──────────────────────────────────────────────────────────────
  {
    group: "Cover Pages",
    label: "Front Cover",
    blurb: "Title, subtitle and art on a full page",
    description:
      "Full-page front cover: title, subtitle, art slot, HOMEBREW banner. Always occupies its own page.",
    icon: IconPopulate,
    action: (editor) =>
      editor.chain().focus().insertContent(frontCoverTemplate()).run(),
  },
  {
    group: "Cover Pages",
    label: "Inside Cover",
    blurb: "Art on top, title below",
    description:
      "Inside cover: background art fills the upper half, title + subtitle overlay at the bottom.",
    icon: IconBookMarked,
    action: (editor) =>
      editor.chain().focus().insertContent(insideCoverTemplate()).run(),
  },
  {
    group: "Cover Pages",
    label: "Part Divider",
    blurb: "A part number and title on its own page",
    description:
      'Section break divider: centred "PART N" number + subtitle with ornamental rules. Perfect for multi-chapter brews.',
    icon: IconBookmark,
    action: (editor) =>
      editor.chain().focus().insertContent(partDividerTemplate()).run(),
  },
  {
    group: "Cover Pages",
    label: "Back Cover",
    blurb: "Blurb, tagline and web address",
    description:
      "Back cover: art strip, subtitle, three blurb paragraphs, tagline, and URL/logo bar. Page footer suppressed.",
    icon: IconNote,
    action: (editor) =>
      editor.chain().focus().insertContent(backCoverTemplate()).run(),
  },

  // ── Layout ──────────────────────────────────────────────────────────────────
  {
    group: "Layout",
    label: "Wide Block",
    kit: "Wide",
    blurb: "Spans both columns",
    description:
      "Wrap content in a full-width container that spans both columns (no-op in single-column documents). Nest tables, stat blocks, or images inside to break the column flow.",
    icon: IconRect,
    action: (editor) => editor.chain().focus().toggleWideBlock().run(),
  },
  {
    group: "Layout",
    label: "Page Break",
    kit: "Page break",
    blurb: "Start a new page here",
    description: "Split the document at this point onto a new page",
    icon: IconMinus,
    action: (editor) => editor.chain().focus().insertPageBreak().run(),
  },
  {
    group: "Layout",
    label: "Column Break",
    blurb: "Start the next column here",
    description:
      "Force content after this point to start at the top of the next column (two-column layout only)",
    icon: IconSplitCell,
    action: (editor) => editor.chain().focus().insertColumnBreak().run(),
    enabled: (_editor, ctx) => !!ctx?.isTwoColumn,
  },

  // ── Spacers ─────────────────────────────────────────────────────────────────
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 S (8 px)",
    description: "Add 8 px of empty vertical space between blocks",
    icon: IconMoveV,
    action: (editor) => editor.chain().focus().setSpacerVertical(8).run(),
  },
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 M (16 px)",
    description: "Add 16 px of empty vertical space between blocks",
    icon: IconMoveV,
    action: (editor) => editor.chain().focus().setSpacerVertical(16).run(),
  },
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 L (32 px)",
    description: "Add 32 px of empty vertical space between blocks",
    icon: IconMoveV,
    action: (editor) => editor.chain().focus().setSpacerVertical(32).run(),
  },
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 XL (64 px)",
    description: "Add 64 px of empty vertical space between blocks",
    icon: IconMoveV,
    action: (editor) => editor.chain().focus().setSpacerVertical(64).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 S (16 px)",
    inPlace: true,
    description: "Insert 16 px of inline horizontal space inside a paragraph",
    icon: IconMoveH,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(16).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 M (32 px)",
    inPlace: true,
    description: "Insert 32 px of inline horizontal space inside a paragraph",
    icon: IconMoveH,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(32).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 L (64 px)",
    inPlace: true,
    description: "Insert 64 px of inline horizontal space inside a paragraph",
    icon: IconMoveH,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(64).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 XL (100 px)",
    inPlace: true,
    description: "Insert 100 px of inline horizontal space inside a paragraph",
    icon: IconMoveH,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(100).run(),
  },

  // ── Callouts ────────────────────────────────────────────────────────────────
  {
    group: "Callouts",
    label: "Callout Box",
    blurb: "A quoted box for rules and flavour",
    description: "Styled inset box for rules text, flavor, or warnings",
    icon: IconQuote,
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    group: "Callouts",
    label: "Note",
    kit: "Sidebar",
    blurb: "A boxed aside for rules and tips",
    description:
      "Boxed highlight for rules reminders and DM tips. 2024 theme: teal-tinted with accent border. Classic theme: parchment with double rule. Shortcut: Mod-Alt-N.",
    icon: IconInfo,
    action: (editor) => editor.chain().focus().toggleNoteBlock().run(),
  },
  {
    group: "Callouts",
    label: "Lens Pair",
    kit: "Bright / Deep",
    blurb: "One passage read two ways",
    description:
      "One passage at two levels: a Bright reading for a child and a Deep one for an adult, set side by side. Wrap it in a Wide block to run the halves in two columns. An empty half is left out of the printed page. Shortcut: Mod-Alt-L.",
    icon: IconLensPair,
    action: (editor) => editor.chain().focus().insertLensPair().run(),
  },
  {
    group: "Callouts",
    label: "Only you see this",
    blurb: "A passage for you alone, never printed",
    description:
      "A passage for you alone: a secret, a twist, a reminder. It is marked in the editor, left out of the preview and the PDF, and never reaches a player. Shortcut: Mod-Alt-S.",
    icon: IconSecret,
    action: (editor) => editor.chain().focus().toggleSecretBlock().run(),
  },
  {
    group: "Callouts",
    label: "Descriptive (Read-Aloud)",
    kit: "Read-aloud",
    blurb: "Boxed text for the table",
    description:
      "Framed box for prose read aloud to players. 2024 theme: flat darker teal. Classic theme: square-cornered parchment frame. Shortcut: Mod-Alt-D.",
    icon: IconScrollText,
    action: (editor) => editor.chain().focus().toggleDescriptiveBlock().run(),
  },
  {
    group: "Callouts",
    label: "Pull Quote",
    kit: "Quote",
    blurb: "A pulled quote",
    description:
      "Italic pulled quote with optional attribution line. No decorative frame: font treatment only. Shortcut: Mod-Alt-Q.",
    icon: IconComment,
    action: (editor) => editor.chain().focus().toggleQuoteBlock().run(),
  },
  {
    group: "Callouts",
    label: "Attribution",
    blurb: "The author line of a pull quote",
    inPlace: true,
    description:
      "Em-dash author/source line inside a pull quote block. Renders in small-caps italic; classic theme uses accent red. Only meaningful inside a pull quote block.",
    icon: IconUserRound,
    action: (editor) => editor.chain().focus().insertAttribution().run(),
    enabled: (editor) => editor.isActive("quoteBlock"),
  },

  // ── Templates ────────────────────────────────────────────────────────────────
  {
    group: "Templates",
    label: "Class Table: Full Caster",
    blurb: "Levels 1 to 20 with spell slots up to 9th",
    description:
      "20-row progression table for full spellcasters (e.g. Wizard, Sorcerer): Level, Prof. Bonus, Features, Cantrips Known, and 1st–9th spell slots. Spans both columns via Wide Block.",
    icon: IconTable,
    action: (editor) =>
      editor.chain().focus().insertContent(fullCasterTable()).run(),
  },
  {
    group: "Templates",
    label: "Class Table: Half Caster",
    blurb: "Levels 1 to 20 with spell slots up to 5th",
    description:
      "20-row progression table for half-casters (e.g. Paladin, Ranger): Level, Prof. Bonus, Features, and 1st–5th spell slots. Spans both columns via Wide Block.",
    icon: IconTable,
    action: (editor) =>
      editor.chain().focus().insertContent(halfCasterTable()).run(),
  },
  {
    group: "Templates",
    label: "Class Table: Third Caster",
    blurb: "Levels 1 to 20 with spell slots up to 4th",
    description:
      "20-row progression table for third-casters (e.g. Arcane Trickster, Eldritch Knight): Level, Prof. Bonus, Features, and 1st–4th spell slots (spellcasting starts at L3). Spans both columns via Wide Block.",
    icon: IconTable,
    action: (editor) =>
      editor.chain().focus().insertContent(thirdCasterTable()).run(),
  },
  {
    group: "Templates",
    label: "Class Table: Martial",
    blurb: "Levels 1 to 20 with a column you name",
    description:
      "20-row progression table for martial classes (e.g. Fighter, Monk): Level, Prof. Bonus, Features, and one custom numeric column. You will be prompted for the column name (e.g. Ki Points, Sneak Attack). Spans both columns via Wide Block.",
    icon: IconTable,
    action: (editor) => {
      const col = prompt("Custom column name (e.g. Ki Points):");
      if (col === null) return;
      editor
        .chain()
        .focus()
        .insertContent(martialTable(col.trim() || "Resource"))
        .run();
    },
  },

  // ── Entity block templates ───────────────────────────────────────────────────
  {
    group: "Templates",
    label: "Monster Stat Block",
    kit: "Stat block",
    blurb: "A stat block to fill in",
    description:
      "Full stat block scaffold (name, type line, AC/HP/Speed/CR, ability scores, saving throws, skills, senses, traits, actions, reactions, legendary actions) with [Bracketed] placeholders. Framed in a callout box matching Homebrewery style.",
    icon: IconMonster,
    action: (editor) =>
      editor.chain().focus().insertContent(monsterStatBlockTemplate()).run(),
  },
  {
    group: "Templates",
    label: "Monster Stat Block (Wide)",
    blurb: "A stat block across both columns",
    description:
      "Same as Monster Stat Block but wrapped in a Wide Block so it spans both columns in a two-column layout. Use this for larger creatures or when you need more horizontal space.",
    icon: IconMaximize,
    action: (editor) =>
      editor
        .chain()
        .focus()
        .insertContent(monsterStatBlockWideTemplate())
        .run(),
  },
  {
    group: "Templates",
    label: "Spell",
    kit: "Spell",
    blurb: "A spell entry to fill in",
    description:
      "Spell entry scaffold (name, level + school subtitle, Casting Time, Range, Components, Duration, description, Spell Lists, At Higher Levels) with [Bracketed] placeholders. Matches the DB-sourced spell block format.",
    icon: IconGenerate,
    action: (editor) =>
      editor.chain().focus().insertContent(spellTemplate()).run(),
  },
  {
    group: "Templates",
    label: "Magic Item",
    kit: "Magic item",
    blurb: "A magic item entry to fill in",
    description:
      "Magic item entry scaffold (name, type + rarity + attunement subtitle, flavour description, mechanical effect, Charges block) with [Bracketed] placeholders. Matches the DB-sourced item block format.",
    icon: IconGem,
    action: (editor) =>
      editor.chain().focus().insertContent(magicItemTemplate()).run(),
  },
  {
    group: "Templates",
    label: "Class Feature",
    blurb: "A class feature to fill in",
    description:
      "Class feature scaffold (feature name, level + class prerequisite line, description body, optional sub-feature heading) with [Bracketed] placeholders.",
    icon: IconAward,
    action: (editor) =>
      editor.chain().focus().insertContent(classFeatureTemplate()).run(),
  },

  // ── Structural ───────────────────────────────────────────────────────────────
  {
    group: "Structural",
    label: "Table of Contents",
    blurb: "A linked list of the headings",
    description:
      "Auto-generated TOC from all H1/H2/H3 headings in the document. Place this block on its own page; the preview and PDF replace it with a live linked list with dotted leaders and page numbers.",
    icon: IconList,
    action: (editor) => editor.chain().focus().insertTocBlock().run(),
  },
];

/** The entry with this label, for a drag or a menu choice that carries one. */
export function findBlockEntry(label: string): BlockEntry | undefined {
  return BLOCK_REGISTRY.find((e) => e.label === label);
}

/** The one line the "/" menu shows for an entry. */
export function blockBlurb(entry: BlockEntry): string {
  if (entry.blurb) return entry.blurb;
  const first = entry.description.split(/(?<=\.)\s/)[0];
  return first.endsWith(".") ? first.slice(0, -1) : first;
}

/** What the kit shows as its featured tiles, in frame order. */
export function featuredBlocks(): BlockEntry[] {
  return KIT_TILE_ORDER.flatMap((name) => {
    const entry = BLOCK_REGISTRY.find((e) => e.kit === name);
    return entry ? [entry] : [];
  });
}

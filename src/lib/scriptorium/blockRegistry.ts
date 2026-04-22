/**
 * Scriptorium Block Registry
 *
 * Each parity ticket (column break, wide block, callouts, etc.) adds one or
 * more entries to BLOCK_REGISTRY rather than patching the picker component.
 * The picker groups them automatically by the `group` field.
 *
 * Groups are rendered in BLOCK_GROUP_ORDER; add new group names there as
 * tickets ship. The hardcoded "Images" section in BlockPickerPanel.vue sits
 * outside this registry because it triggers external state (asset panel) in
 * addition to pure editor operations.
 */

import type { Component } from "vue";
import type { Editor } from "@tiptap/core";
import type { WatercolorVariant } from "@/lib/tiptap/watercolor";
import {
  Award,
  BookMarked,
  BookOpen,
  BookText,
  Bookmark,
  Droplets,
  Gem,
  Hash,
  Info,
  List,
  Maximize2,
  MessageSquare,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Pen,
  Quote,
  RectangleHorizontal,
  RefreshCw,
  ScrollText,
  Skull,
  Sparkles,
  Stamp,
  SquareSplitVertical,
  Table2,
  UserRound,
} from "lucide-vue-next";
import {
  frontCoverTemplate,
  insideCoverTemplate,
  partDividerTemplate,
  backCoverTemplate,
} from "@/lib/scriptorium/coverTemplates";
import {
  fullCasterTable,
  halfCasterTable,
  thirdCasterTable,
  martialTable,
} from "@/lib/scriptorium/classTableTemplates";
import {
  monsterStatBlockTemplate,
  monsterStatBlockWideTemplate,
  spellTemplate,
  magicItemTemplate,
  classFeatureTemplate,
} from "@/lib/scriptorium/templates";

export interface BlockEntry {
  /** Which section this entry belongs to. */
  group: string;
  label: string;
  description: string;
  icon: Component;
  /** Called with the focused editor when the user clicks the entry. */
  action: (editor: Editor) => void;
  /**
   * When provided, the entry is greyed-out and unclickable if this returns
   * false. Use for state-dependent restrictions (e.g. column break only valid
   * in two-column mode). Do NOT use for "not implemented yet" — just omit the
   * entry until the feature ships.
   */
  enabled?: (editor: Editor) => boolean;
}

/** Controls the display order of groups in the picker. */
export const BLOCK_GROUP_ORDER: string[] = [
  "Cover Pages",
  "Layout",
  "Callouts",
  "Templates",
  "Structural",
  "Decoration",
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
  // ── Cover Pages ──────────────────────────────────────────────────────────────
  {
    group: "Cover Pages",
    label: "Front Cover",
    description:
      "Full-page front cover: title, subtitle, art slot, HOMEBREW banner. Always occupies its own page.",
    icon: BookOpen,
    action: (editor) =>
      editor.chain().focus().insertContent(frontCoverTemplate()).run(),
  },
  {
    group: "Cover Pages",
    label: "Inside Cover",
    description:
      "Inside cover: background art fills the upper half, title + subtitle overlay at the bottom.",
    icon: BookMarked,
    action: (editor) =>
      editor.chain().focus().insertContent(insideCoverTemplate()).run(),
  },
  {
    group: "Cover Pages",
    label: "Part Divider",
    description:
      'Section break divider: centred "PART N" number + subtitle with ornamental rules. Perfect for multi-chapter brews.',
    icon: Bookmark,
    action: (editor) =>
      editor.chain().focus().insertContent(partDividerTemplate()).run(),
  },
  {
    group: "Cover Pages",
    label: "Back Cover",
    description:
      "Back cover: art strip, subtitle, three blurb paragraphs, tagline, and URL/logo bar. Page footer suppressed.",
    icon: BookText,
    action: (editor) =>
      editor.chain().focus().insertContent(backCoverTemplate()).run(),
  },

  // ── Layout ──────────────────────────────────────────────────────────────────
  {
    group: "Layout",
    label: "Wide Block",
    description:
      "Wrap content in a full-width container that spans both columns (no-op in single-column documents). Nest tables, stat blocks, or images inside to break the column flow.",
    icon: RectangleHorizontal,
    action: (editor) => editor.chain().focus().toggleWideBlock().run(),
  },
  {
    group: "Layout",
    label: "Page Break",
    description: "Split the document at this point onto a new page",
    icon: Minus,
    action: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
  {
    group: "Layout",
    label: "Column Break",
    description:
      "Force content after this point to start at the top of the next column (two-column layout only)",
    icon: SquareSplitVertical,
    action: (editor) => editor.chain().focus().insertColumnBreak().run(),
  },

  // ── Spacers ─────────────────────────────────────────────────────────────────
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 S (8 px)",
    description: "Add 8 px of empty vertical space between blocks",
    icon: MoveVertical,
    action: (editor) => editor.chain().focus().setSpacerVertical(8).run(),
  },
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 M (16 px)",
    description: "Add 16 px of empty vertical space between blocks",
    icon: MoveVertical,
    action: (editor) => editor.chain().focus().setSpacerVertical(16).run(),
  },
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 L (32 px)",
    description: "Add 32 px of empty vertical space between blocks",
    icon: MoveVertical,
    action: (editor) => editor.chain().focus().setSpacerVertical(32).run(),
  },
  {
    group: "Layout",
    label: "Vertical Spacer \u2014 XL (64 px)",
    description: "Add 64 px of empty vertical space between blocks",
    icon: MoveVertical,
    action: (editor) => editor.chain().focus().setSpacerVertical(64).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 S (16 px)",
    description: "Insert 16 px of inline horizontal space inside a paragraph",
    icon: MoveHorizontal,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(16).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 M (32 px)",
    description: "Insert 32 px of inline horizontal space inside a paragraph",
    icon: MoveHorizontal,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(32).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 L (64 px)",
    description: "Insert 64 px of inline horizontal space inside a paragraph",
    icon: MoveHorizontal,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(64).run(),
  },
  {
    group: "Layout",
    label: "Horizontal Spacer \u2014 XL (100 px)",
    description: "Insert 100 px of inline horizontal space inside a paragraph",
    icon: MoveHorizontal,
    action: (editor) => editor.chain().focus().setSpacerHorizontal(100).run(),
  },

  // ── Callouts ────────────────────────────────────────────────────────────────
  {
    group: "Callouts",
    label: "Callout Box",
    description: "Styled inset box for rules text, flavor, or warnings",
    icon: Quote,
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    group: "Callouts",
    label: "Note",
    description:
      "Boxed highlight for rules reminders and DM tips. 2024 theme: teal-tinted with accent border. Classic theme: parchment with double rule. Shortcut: Mod-Alt-N.",
    icon: Info,
    action: (editor) => editor.chain().focus().toggleNoteBlock().run(),
  },
  {
    group: "Callouts",
    label: "Descriptive (Read-Aloud)",
    description:
      "Framed box for prose read aloud to players. 2024 theme: flat darker teal. Classic theme: square-cornered parchment frame. Shortcut: Mod-Alt-D.",
    icon: ScrollText,
    action: (editor) => editor.chain().focus().toggleDescriptiveBlock().run(),
  },
  {
    group: "Callouts",
    label: "Quote",
    description:
      "Italic pulled quote with optional attribution line. No decorative frame — font treatment only. Shortcut: Mod-Alt-Q.",
    icon: MessageSquare,
    action: (editor) => editor.chain().focus().toggleQuoteBlock().run(),
  },
  {
    group: "Callouts",
    label: "Attribution",
    description:
      "Em-dash author/source line inside a Quote block. Renders in small-caps italic; classic theme uses accent red. Only meaningful inside a Quote block.",
    icon: UserRound,
    action: (editor) => editor.chain().focus().insertAttribution().run(),
    enabled: (editor) => editor.isActive("quoteBlock"),
  },

  // ── Decoration ──────────────────────────────────────────────────────────────
  {
    group: "Decoration",
    label: "Watercolor Splatter",
    description:
      "Absolutely-positioned watercolor blob overlay. Select the node to choose variant (1\u201312), position, width, tint colour, and opacity.",
    icon: Droplets,
    action: (editor) => {
      const variant = (Math.floor(Math.random() * 12) + 1) as WatercolorVariant;
      editor.chain().focus().insertWatercolor({ variant }).run();
    },
  },
  {
    group: "Decoration",
    label: "Watermark",
    description:
      "Large diagonal text across the page (e.g. DRAFT, PLAYTEST). Sits behind body content.",
    icon: Stamp,
    action: (editor) =>
      editor.chain().focus().insertWatermark({ text: "DRAFT" }).run(),
  },
  {
    group: "Decoration",
    label: "Artist Credit",
    description:
      'Tiny italic "Art by \u2026" line in a chosen page corner. Default: bottom-right.',
    icon: Pen,
    action: (editor) =>
      editor
        .chain()
        .focus()
        .insertArtistCredit({ position: "bottom-right" })
        .run(),
  },

  // ── Templates ────────────────────────────────────────────────────────────────
  {
    group: "Templates",
    label: "Class Table — Full Caster",
    description:
      "20-row progression table for full spellcasters (e.g. Wizard, Sorcerer): Level, Prof. Bonus, Features, Cantrips Known, and 1st–9th spell slots. Spans both columns via Wide Block.",
    icon: Table2,
    action: (editor) =>
      editor.chain().focus().insertContent(fullCasterTable()).run(),
  },
  {
    group: "Templates",
    label: "Class Table — Half Caster",
    description:
      "20-row progression table for half-casters (e.g. Paladin, Ranger): Level, Prof. Bonus, Features, and 1st–5th spell slots. Spans both columns via Wide Block.",
    icon: Table2,
    action: (editor) =>
      editor.chain().focus().insertContent(halfCasterTable()).run(),
  },
  {
    group: "Templates",
    label: "Class Table — Third Caster",
    description:
      "20-row progression table for third-casters (e.g. Arcane Trickster, Eldritch Knight): Level, Prof. Bonus, Features, and 1st–4th spell slots (spellcasting starts at L3). Spans both columns via Wide Block.",
    icon: Table2,
    action: (editor) =>
      editor.chain().focus().insertContent(thirdCasterTable()).run(),
  },
  {
    group: "Templates",
    label: "Class Table — Martial",
    description:
      "20-row progression table for martial classes (e.g. Fighter, Monk): Level, Prof. Bonus, Features, and one custom numeric column. You will be prompted for the column name (e.g. Ki Points, Sneak Attack). Spans both columns via Wide Block.",
    icon: Table2,
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
    description:
      "Full stat block scaffold (name, type line, AC/HP/Speed/CR, ability scores, saving throws, skills, senses, traits, actions, reactions, legendary actions) with [Bracketed] placeholders. Framed in a callout box matching Homebrewery style.",
    icon: Skull,
    action: (editor) =>
      editor.chain().focus().insertContent(monsterStatBlockTemplate()).run(),
  },
  {
    group: "Templates",
    label: "Monster Stat Block (Wide)",
    description:
      "Same as Monster Stat Block but wrapped in a Wide Block so it spans both columns in a two-column layout. Use this for larger creatures or when you need more horizontal space.",
    icon: Maximize2,
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
    description:
      "Spell entry scaffold (name, level + school subtitle, Casting Time, Range, Components, Duration, description, Spell Lists, At Higher Levels) with [Bracketed] placeholders. Matches the DB-sourced spell block format.",
    icon: Sparkles,
    action: (editor) =>
      editor.chain().focus().insertContent(spellTemplate()).run(),
  },
  {
    group: "Templates",
    label: "Magic Item",
    description:
      "Magic item entry scaffold (name, type + rarity + attunement subtitle, flavour description, mechanical effect, Charges block) with [Bracketed] placeholders. Matches the DB-sourced item block format.",
    icon: Gem,
    action: (editor) =>
      editor.chain().focus().insertContent(magicItemTemplate()).run(),
  },
  {
    group: "Templates",
    label: "Class Feature",
    description:
      "Class feature scaffold (feature name, level + class prerequisite line, description body, optional sub-feature heading) with [Bracketed] placeholders.",
    icon: Award,
    action: (editor) =>
      editor.chain().focus().insertContent(classFeatureTemplate()).run(),
  },

  // ── Structural ───────────────────────────────────────────────────────────────
  {
    group: "Structural",
    label: "Table of Contents",
    description:
      "Auto-generated TOC from all H1/H2/H3 headings in the document. Place this block on its own page; the preview and PDF replace it with a live linked list with dotted leaders and page numbers.",
    icon: List,
    action: (editor) => editor.chain().focus().insertTocBlock().run(),
  },
  {
    group: "Structural",
    label: "Skip Page Number",
    description:
      "Marks this page so its number is omitted and the running counter does not advance (e.g. for a full-page illustration).",
    icon: Hash,
    action: (editor) => editor.chain().focus().insertSkipCounting().run(),
  },
  {
    group: "Structural",
    label: "Reset Page Counter",
    description:
      "Resets the running page counter back to the document\u2019s starting number from this page onwards. Useful after a cover page or unnumbered front matter.",
    icon: RefreshCw,
    action: (editor) => editor.chain().focus().insertResetCounting().run(),
  },
];

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
import {
  Droplets,
  Minus,
  MoveHorizontal,
  MoveVertical,
  Pen,
  Quote,
  Stamp,
  SquareSplitVertical,
} from "lucide-vue-next";

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
  // ── Layout ──────────────────────────────────────────────────────────────────
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

  // ── Decoration ──────────────────────────────────────────────────────────────
  {
    group: "Decoration",
    label: "Watercolor Splatter",
    description:
      "Absolutely-positioned watercolor blob overlay. Select the node to choose variant (1\u201312), position, width, tint colour, and opacity.",
    icon: Droplets,
    action: (editor) =>
      editor.chain().focus().insertWatercolor({ variant: 1 }).run(),
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
];

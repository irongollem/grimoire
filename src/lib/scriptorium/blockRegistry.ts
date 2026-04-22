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
import { Minus, Quote } from "lucide-vue-next";

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

  // ── Callouts ────────────────────────────────────────────────────────────────
  {
    group: "Callouts",
    label: "Callout Box",
    description: "Styled inset box for rules text, flavor, or warnings",
    icon: Quote,
    action: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
];

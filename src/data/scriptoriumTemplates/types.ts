/*
 * Scriptorium template types (Phase C, #455).
 *
 * A template is a finished-looking starting document for the gallery at
 * /scriptorium/new — a cover, TOC, chapter skeleton, example blocks, plus
 * the document settings (theme, page size, two-column, page numbers…). The
 * gallery seeds a NEW (unsaved) editor with `build()` + `settings`; block ids
 * are assigned fresh by the BlockId extension when the editor mounts.
 */

import type { JSONContent } from "@tiptap/core";
import type {
  ScriptoriumDocType,
  ScriptoriumTheme,
  ScriptoriumPageSize,
} from "@/types/scriptorium.types";

export interface ScriptoriumTemplateSettings {
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  isTwoColumn: boolean;
  inkFriendly: boolean;
  showPageNumbers: boolean;
  footerText: string;
  pageNumberStart: number;
  tags: string[];
}

export interface ScriptoriumTemplate {
  /** Stable kebab-case id. */
  id: string;
  name: string;
  description: string;
  docType: ScriptoriumDocType;
  settings: ScriptoriumTemplateSettings;
  /** Build a fresh Tiptap `doc` node (called per pick so nothing is shared). */
  build: () => JSONContent;
}

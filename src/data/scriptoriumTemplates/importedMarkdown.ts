/*
 * "Template" wrapper for an imported markdown file (gallery import card).
 *
 * Import rides the template-gallery seed path: the picked file is converted
 * to Tiptap JSON and handed to the editor exactly like a gallery template, so
 * the document stays unsaved until the user saves it — same as any other new
 * document. See src/lib/scriptorium/markdownImport.ts for the conversion.
 */

import type { ScriptoriumTemplate, ScriptoriumTemplateSettings } from "./types";
import {
  markdownToScriptoriumContent,
  markdownTitle,
} from "@/lib/scriptorium/markdownImport";

const IMPORT_SETTINGS: ScriptoriumTemplateSettings = {
  theme: "onednd2024",
  pageSize: "A4",
  // Single column by default, matching the gallery templates — imported prose
  // is easy to flip to two-column once it's in the book.
  isTwoColumn: false,
  inkFriendly: false,
  showPageNumbers: true,
  footerText: "",
  pageNumberStart: 1,
  tags: [],
};

// Each import gets a distinct id: the editor view keys its remount on the
// chosen template's id, so two files imported back-to-back must not collide.
let importCount = 0;

/** Build a one-off gallery template from an uploaded markdown file. */
export function importedMarkdownTemplate(
  fileName: string,
  markdown: string,
): ScriptoriumTemplate {
  const baseName = fileName.replace(/\.(md|markdown|txt)$/i, "");
  importCount += 1;
  return {
    id: `imported-markdown-${importCount}`,
    name: markdownTitle(markdown, baseName),
    description: `Imported from ${fileName}`,
    docType: "custom",
    settings: { ...IMPORT_SETTINGS, tags: [] },
    build: () => markdownToScriptoriumContent(markdown),
  };
}

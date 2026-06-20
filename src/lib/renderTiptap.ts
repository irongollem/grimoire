import { generateHTML } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { sanitizeHtml } from "./sanitizeHtml";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Render Tiptap document JSON (or a raw string) to SANITIZED HTML for `v-html`.
 *
 * Replaces the duplicated `generateHTML(JSON.parse(content), [StarterKit])`
 * helpers that returned the raw string on a parse failure — that fallback fed
 * unsanitized attacker content straight into `v-html`. Here the StarterKit output
 * (which `@tiptap/core` does NOT sanitize) is run through DOMPurify, and a
 * non-Tiptap value is rendered as ESCAPED text, never raw HTML.
 */
export function renderTiptapHtml(content: string | null | undefined): string {
  if (!content) return "";
  try {
    const json = typeof content === "string" ? JSON.parse(content) : content;
    if (json?.type === "doc") return sanitizeHtml(generateHTML(json, [StarterKit]));
  } catch {
    // Not Tiptap JSON — fall through and render as escaped text.
  }
  return `<p>${escapeHtml(String(content))}</p>`;
}

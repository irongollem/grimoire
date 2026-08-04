import DOMPurify from "dompurify";

/**
 * Sanitize an HTML string for safe use with `v-html`.
 *
 * Vue escapes `{{ }}` but NOT `v-html`, and the things that feed our `v-html`
 * sinks — `marked` output, Tiptap's `generateHTML`, hand-rolled markdown — do NOT
 * strip script/event-handler attributes (`marked` even passes raw HTML through
 * verbatim). Every `v-html` binding that renders user-, DM-, or AI-authored
 * content MUST pass through here. DOMPurify removes `<script>`, `on*` handlers,
 * `javascript:` URIs, etc. while preserving ordinary formatting markup.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// Note for anyone tempted to add an explicit ALLOWED_ATTR entry for
// `data-ai-generated` / `data-ai-model` (#606, provenance-architecture.md
// §6): don't — it's redundant. DOMPurify's `ALLOW_DATA_ATTR` defaults to
// `true` and is never overridden above, so every `data-*` attribute already
// survives (matched against DOMPurify's own `/^data-[-\w.]+$/`-style check,
// independent of the `USE_PROFILES` tag/attr list) — that's the existing,
// deliberate policy this repo already relies on for `data-block-id`,
// `data-type="columns"`, `data-prompt`, etc. `onclick` and friends are never
// `data-*`, so they're unaffected and still stripped. See sanitizeHtml.test.ts
// for the proof.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/**
 * Minimal markdown (`**bold**`, `*em*`, blank-line paragraphs, single-newline
 * `<br>`) → safe HTML. The input is HTML-escaped FIRST, so literal `<script>` /
 * `<img onerror=…>` in the source becomes inert text; only the formatting tags
 * this function emits survive. Replaces three identical hand-rolled renderers in
 * the rules tabs that fed unescaped text into `v-html`.
 */
export function renderBasicMarkdown(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .split(/\n\n+/)
    .map(
      (para) =>
        `<p>${escapeHtml(para)
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}

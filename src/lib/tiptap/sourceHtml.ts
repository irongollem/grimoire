/**
 * Normalizes HTML pasted into the document importer's "paste text" source
 * (#829) before it reaches the paste editor in `DocumentImportTab.vue`.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 *
 * A real ⌘C off a published adventure page puts two flavours on the
 * clipboard: `text/plain`, which is completely flat — every heading is a
 * bare line, all structure lost — and `text/html`, which is fully
 * structured. Measured on one D&D Beyond chapter: `<h2>`×1, `<h3>`×5,
 * `<h4>`×15, `<h5>`×1, a `<table>`, a `<figure>`, and 17
 * `<aside class="read-aloud-text">` blocks (the chapter's boxed text).
 * Pasting the plain-text flavour throws away that entire signal, which is
 * the whole reason this feature can work — so the paste handler reads the
 * HTML flavour and runs it through here first.
 *
 * ── The degradation ladder (do not couple this to one publisher) ─────────
 *
 *   1. Generic HTML semantics — h1-h6, blockquote, table, ul/ol/li,
 *      em/strong, p — universal, and the bulk of what this module leans on.
 *   2. A small, named lookup of publisher class hints (`BOXED_TEXT_CLASS_HINTS`)
 *      for the one thing generic HTML has no tag for: a "read this aloud"
 *      callout. Its absence degrades gracefully to (1) — an unhinted `<div>`
 *      just passes through untouched.
 *   3. Flat plain text still works (handled by the caller, not this module)
 *      — the model just has to judge more without the structural signal.
 *
 * This module's only job is to not destroy structure. Judging what any of it
 * *means* (which heading is a beat, which blockquote is read-aloud text)
 * belongs to the AI extraction pass downstream — see the prompt guidance in
 * `supabase/functions/import-extract/index.ts`.
 */
import { getSchema } from "@tiptap/core";
import { DOMParser as ProseMirrorDOMParser } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";

// ── Publisher class hints ────────────────────────────────────────────────

/**
 * Class-name substrings (case-insensitive, matched against an element's
 * whole `class` attribute) that mark a boxed/read-aloud-style block in a
 * given publisher's HTML export. Extend this table when a new publisher's
 * export is measured — never add a per-publisher `if` branch instead: an
 * unmatched class already degrades gracefully to a plain passthrough (rule 1
 * above), so growing this list is pure upside.
 *
 * "read-aloud" is the one entry with real evidence behind it: measured on a
 * D&D Beyond chapter export, `<aside class="read-aloud-text">` wraps every
 * one of its 17 boxed-text blocks. Other WotC books and other publishers are
 * not expected to share this markup — that is exactly why this is a lookup
 * table to extend, not an assumption baked into the parser.
 */
const BOXED_TEXT_CLASS_HINTS: readonly string[] = ["read-aloud"];

function hasBoxedTextHint(el: Element): boolean {
  const className = el.getAttribute("class");
  if (!className) return false;
  const lower = className.toLowerCase();
  return BOXED_TEXT_CLASS_HINTS.some((hint) => lower.includes(hint));
}

// ── DOM mutation helpers ─────────────────────────────────────────────────

/**
 * Replaces `el` in place with a `<blockquote>` wrapping the same children.
 * No-op if `el` is already a blockquote, or already detached (an earlier
 * pass over the same querySelectorAll snapshot already removed an ancestor —
 * see the loop in `normalizeSourceHtml`).
 */
function convertToBlockquote(doc: Document, el: Element): void {
  if (!el.parentNode || el.tagName.toLowerCase() === "blockquote") return;
  const blockquote = doc.createElement("blockquote");
  while (el.firstChild) blockquote.appendChild(el.firstChild);
  el.replaceWith(blockquote);
}

/** Unwraps `el`, keeping its children in place — for wrappers whose content matters but whose tag doesn't (tooltip `<a>`s). No-op if already detached. */
function unwrapElement(el: Element): void {
  el.replaceWith(...Array.from(el.childNodes));
}

/** Tags that carry no structure and only add noise — removed with their contents. Images cannot survive a paste anyway, so a `<figure>`'s caption floating alone is just clutter. */
const NOISE_TAGS = new Set(["script", "style", "figure", "figcaption"]);

/**
 * Cleans up pasted HTML so Tiptap's existing extensions (no publisher- or
 * app-specific code inside them) preserve the structure a copied adventure
 * page actually has. Pure string in, string out — parsed with the browser's
 * own `DOMParser`, never regex: regex cannot correctly handle nested or
 * malformed markup, and this runs on real clipboard HTML.
 */
export function normalizeSourceHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const body = doc.body;

  // One pass over every element in the document. querySelectorAll takes a
  // static snapshot, so replacing/removing elements as we go never skips or
  // revisits a node — and a node whose ancestor was already removed/replaced
  // earlier in this same snapshot safely no-ops when its own turn comes
  // (convertToBlockquote and unwrapElement both guard on `parentNode`;
  // `Element.remove()` is a no-op on an already-detached node per spec).
  for (const el of Array.from(body.querySelectorAll("*"))) {
    const tag = el.tagName.toLowerCase();
    if (NOISE_TAGS.has(tag)) {
      el.remove();
      continue;
    }
    if (tag === "a") {
      unwrapElement(el);
      continue;
    }
    if (tag === "aside" || hasBoxedTextHint(el)) {
      convertToBlockquote(doc, el);
      continue;
    }
    // Everything else passes through untouched — do not whitelist-filter
    // aggressively. Unknown tags Tiptap ignores are harmless.
  }

  return body.innerHTML;
}

// ── HTML → Tiptap content ────────────────────────────────────────────────

/**
 * A schema built solely to parse normalized HTML into Tiptap-shaped JSON —
 * never rendered, never mounted. It only needs to recognize the tags
 * `normalizeSourceHtml` promises to preserve (headings, blockquote, lists,
 * tables, bold/italic, paragraphs); it does not need to match
 * `RichTextEditor.vue`'s full schema (calendar refs, entity mentions,
 * highlight, task lists, columns…), because only the resulting node/mark
 * *types* matter once this is handed back to that component as JSON — its
 * own (larger) schema re-validates the JSON at mount and fills in whatever
 * attribute defaults this smaller schema didn't set.
 */
const PASTE_SCHEMA = getSchema([StarterKit, Table, TableRow, TableCell, TableHeader]);

/**
 * Converts pasted HTML into the array of block-level Tiptap nodes it
 * represents — the same shape `parseMarkdown` (markdownToTiptap.ts) returns
 * for a markdown string, so a caller can splice either into a doc's
 * `content`. Used by `DocumentImportTab.vue`'s paste handler to insert
 * normalized clipboard HTML into a live `RichTextEditor`, which exposes no
 * "insert HTML" command of its own (and is frozen — see that file's own
 * comment on why this route exists rather than a change there).
 *
 * Delegates the actual HTML→node conversion to ProseMirror's own DOMParser
 * against a real Tiptap schema, rather than a hand-rolled walker: headings,
 * blockquote, lists, tables and marks all already have `parseHTML` rules on
 * their node/mark specs, and reimplementing that here would be a second,
 * drifting copy of logic the editor already owns.
 */
export function sourceHtmlToTiptapContent(html: string): Record<string, unknown>[] {
  const normalized = normalizeSourceHtml(html);
  const dom = new DOMParser().parseFromString(normalized, "text/html").body;
  const doc = ProseMirrorDOMParser.fromSchema(PASTE_SCHEMA).parse(dom);
  const json = doc.toJSON() as { content?: Record<string, unknown>[] };
  return json.content ?? [];
}

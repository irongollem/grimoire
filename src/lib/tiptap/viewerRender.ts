/**
 * Renders stored rich text (Tiptap JSON) to Vue VNodes without Tiptap.
 *
 * `RichTextViewer` has ~64 call sites, most of them pages that only *display*
 * rich text. Building a read-only Tiptap editor there made each of them
 * download ProseMirror and every extension (~142 kB gzip) to draw some
 * paragraphs. This module walks the document JSON directly, so nothing under
 * `@tiptap/*` or `prosemirror-*` may be imported here — not even for types
 * that survive compilation. `viewerRender.test.ts` pins the output against
 * `generateHTML` from the real extension list, which is what keeps the two
 * implementations from drifting: when an extension changes how a node
 * renders, that test fails and this file follows.
 *
 * Security: text and attribute values go through Vue, which escapes them.
 * Attributes are read from a per-node allowlist, never spread from the JSON,
 * so a stored `onerror` has nowhere to land. Link hrefs follow Tiptap's own
 * URI policy and image sources are checked the same way.
 */

import { h, type Component, type VNode, type VNodeChild } from "vue";
import CalendarEventRefChip from "@/components/tiptap/CalendarEventRefChip.vue";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";
import IllustrationSuggestionChip from "@/components/tiptap/IllustrationSuggestionChip.vue";
import PendingImageCard from "@/components/tiptap/PendingImageCard.vue";
import type { EntityType } from "@/lib/tiptap/nodeViewTypes";
import { storedTextToDoc } from "@/lib/tiptap/markdownToTiptap";

type Attrs = Record<string, unknown>;

interface JsonMark {
  type: string;
  attrs: Attrs;
}

interface JsonNode {
  type: string;
  attrs: Attrs;
  content: JsonNode[];
  marks: JsonMark[];
  text: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toMark(value: unknown): JsonMark | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  return { type: value.type, attrs: isRecord(value.attrs) ? value.attrs : {} };
}

/** Normalises a raw JSON value into a node; anything that is not a node is dropped. */
function toNode(value: unknown): JsonNode | null {
  if (!isRecord(value) || typeof value.type !== "string") return null;
  const content = Array.isArray(value.content) ? value.content : [];
  const marks = Array.isArray(value.marks) ? value.marks : [];
  return {
    type: value.type,
    attrs: isRecord(value.attrs) ? value.attrs : {},
    content: content.flatMap((child) => toNode(child) ?? []),
    marks: marks.flatMap((m) => toMark(m) ?? []),
    text: typeof value.text === "string" ? value.text : "",
  };
}

// ── Attribute helpers ───────────────────────────────────────────────────────

/** A scalar attribute value, or undefined (Vue omits undefined attributes). */
function scalar(value: unknown): string | number | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Same rule as Tiptap's `isValidCSSStyleValue`: no way to smuggle a second declaration. */
function isValidCssValue(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !/[;{}]/.test(value);
}

const TEXT_ALIGNMENTS = ["left", "center", "right", "justify"];

function alignStyle(attrs: Attrs): string | undefined {
  const align = attrs.textAlign;
  if (!isValidCssValue(align) || !TEXT_ALIGNMENTS.includes(align)) return undefined;
  return `text-align: ${align}`;
}

// ── URI policy ──────────────────────────────────────────────────────────────

// Mirrors `isAllowedUri` in @tiptap/extension-link (its default protocol list,
// which is what the editor's Link mark was configured with). Reimplemented
// because importing it would drag the extension, and with it Tiptap, back in.
const LINK_PROTOCOLS = ["http", "https", "ftp", "ftps", "mailto", "tel", "callto", "sms", "cid", "xmpp"];
// Unicode whitespace and control characters browsers ignore inside a scheme
// ("java\tscript:") — the same set DOMPurify strips before matching.
// eslint-disable-next-line no-control-regex
const SCHEME_NOISE = /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g;
const LINK_ALLOWED = new RegExp(
  `^(?:(?:${LINK_PROTOCOLS.join("|")}):|[^a-z]|[a-z0-9+.\\-]+(?:[^a-z+.\\-:]|$))`,
  "i",
);

function isAllowedLinkHref(href: string): boolean {
  return !href || LINK_ALLOWED.test(href.replace(SCHEME_NOISE, ""));
}

const IMAGE_DATA_URI = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp);/i;

/** Network and relative images, blob: previews and raster data: URIs; never script-capable schemes. */
function isSafeImageSrc(src: string): boolean {
  const cleaned = src.replace(SCHEME_NOISE, "");
  if (IMAGE_DATA_URI.test(cleaned)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(cleaned);
  if (!scheme) return true; // relative URL
  return ["http", "https", "blob"].includes(scheme[1].toLowerCase());
}

// ── Marks ───────────────────────────────────────────────────────────────────

// The order marks nest in, outermost first: the schema's mark rank, which is
// what ProseMirror sorts a node's marks by before serialising. Asserted by the
// "marks combined" parity test, so a reorder upstream fails loudly.
const MARK_ORDER = ["link", "bold", "code", "italic", "strike", "underline", "highlight"];

function markRank(mark: JsonMark): number {
  return MARK_ORDER.indexOf(mark.type);
}

function sameMark(a: JsonMark, b: JsonMark): boolean {
  if (a.type !== b.type) return false;
  const keys = new Set([...Object.keys(a.attrs), ...Object.keys(b.attrs)]);
  for (const key of keys) {
    if (a.attrs[key] !== b.attrs[key]) return false;
  }
  return true;
}

function wrapMark(mark: JsonMark, children: VNodeChild[]): VNode | null {
  switch (mark.type) {
    case "bold":
      return h("strong", children);
    case "italic":
      return h("em", children);
    case "strike":
      return h("s", children);
    case "underline":
      return h("u", children);
    case "code":
      return h("code", children);
    case "highlight":
      return h("mark", children);
    case "link": {
      const href = text(mark.attrs.href);
      return h(
        "a",
        {
          target: text(mark.attrs.target) ?? "_blank",
          rel: text(mark.attrs.rel) ?? "noopener noreferrer",
          class: text(mark.attrs.class),
          title: text(mark.attrs.title),
          href: href !== undefined && isAllowedLinkHref(href) ? href : "",
        },
        children,
      );
    }
    default:
      return null;
  }
}

interface OpenMark {
  mark: JsonMark;
  children: VNodeChild[];
}

/**
 * Inline content with marks, nested the way ProseMirror's DOMSerializer does:
 * a mark stays open across adjacent nodes that carry it, so
 * `bold("a") bold+italic("b")` is `<strong>a<em>b</em></strong>`.
 */
function renderInline(nodes: JsonNode[]): VNodeChild[] {
  const root: VNodeChild[] = [];
  const active: OpenMark[] = [];
  let top = root;

  const close = (to: number) => {
    while (active.length > to) {
      const open = active.pop();
      if (!open) break;
      const parent = active.length > 0 ? active[active.length - 1].children : root;
      const el = wrapMark(open.mark, open.children);
      if (el) parent.push(el);
      else parent.push(...open.children);
    }
    top = active.length > 0 ? active[active.length - 1].children : root;
  };

  for (const node of nodes) {
    const marks = node.marks.filter((m) => markRank(m) >= 0).sort((a, b) => markRank(a) - markRank(b));
    let keep = 0;
    while (keep < active.length && keep < marks.length && sameMark(marks[keep], active[keep].mark)) keep++;
    close(keep);
    for (let i = keep; i < marks.length; i++) {
      const open: OpenMark = { mark: marks[i], children: [] };
      active.push(open);
      top = open.children;
    }
    const rendered = renderNode(node);
    if (rendered !== null) top.push(rendered);
  }
  close(0);
  return root;
}

// ── Nodes ───────────────────────────────────────────────────────────────────

/**
 * ProseMirror gives a textblock whose last child is not plain text (empty, or
 * ending in a hard break or an inline chip) a trailing `<br>` so the line has
 * height. Without it an empty paragraph collapses to nothing.
 */
function withTrailingBreak(children: VNodeChild[], nodes: JsonNode[]): VNodeChild[] {
  const last = nodes[nodes.length - 1];
  if (last && last.type === "text" && !last.text.endsWith("\n")) return children;
  return [...children, h("br", { class: "ProseMirror-trailingBreak" })];
}

function textblock(
  tag: string,
  props: Record<string, unknown>,
  node: JsonNode,
): VNode {
  return h(tag, props, withTrailingBreak(renderInline(node.content), node.content));
}

function renderBlocks(nodes: JsonNode[]): VNodeChild[] {
  return nodes.flatMap((child) => renderNode(child) ?? []);
}

function positiveInt(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 1;
}

function spanAttr(value: unknown): number | undefined {
  const n = positiveInt(value);
  return n === 1 ? undefined : n;
}

function colwidths(attrs: Attrs): number[] | null {
  const raw = attrs.colwidth;
  if (!Array.isArray(raw)) return null;
  return raw.map((w) => (typeof w === "number" && Number.isFinite(w) ? w : 0));
}

const CELL_MIN_WIDTH = 25;

function renderTable(node: JsonNode): VNode {
  // Same arithmetic as Tiptap's `createColGroup` (first row decides the columns).
  let total = 0;
  let fixed = true;
  const cols: VNode[] = [];
  const first = node.content[0];
  for (const cell of first?.content ?? []) {
    const widths = colwidths(cell.attrs);
    const span = positiveInt(cell.attrs.colspan);
    for (let j = 0; j < span; j++) {
      const width = widths?.[j];
      total += width || CELL_MIN_WIDTH;
      if (!width) fixed = false;
      cols.push(
        h("col", {
          style: width ? `width: ${Math.max(width, CELL_MIN_WIDTH)}px` : `min-width: ${CELL_MIN_WIDTH}px`,
        }),
      );
    }
  }
  const style = !first ? undefined : fixed ? `width: ${total}px` : `min-width: ${total}px`;
  // The editor mounts tables through TableView, which wraps them in this div;
  // kept so the DOM (and anything laid out around it) is the one pages had.
  return h("div", { class: "tableWrapper" }, [
    h("table", { style }, [
      ...(first ? [h("colgroup", cols)] : []),
      h("tbody", renderBlocks(node.content)),
    ]),
  ]);
}

function renderCell(tag: "td" | "th", node: JsonNode): VNode {
  const widths = colwidths(node.attrs);
  const align = node.attrs.align;
  return h(
    tag,
    {
      colspan: spanAttr(node.attrs.colspan),
      rowspan: spanAttr(node.attrs.rowspan),
      colwidth: widths ? widths.join(",") : undefined,
      style: align === "left" || align === "right" || align === "center" ? `text-align: ${align}` : undefined,
    },
    renderBlocks(node.content),
  );
}

function taskItemLabel(node: JsonNode): string {
  return `Task item checkbox for ${textContent(node) || "empty task item"}`;
}

function textContent(node: JsonNode): string {
  if (node.type === "text") return node.text;
  return node.content.map(textContent).join("");
}

// Same inline style TaskItem's node view puts on its label span.
const VISUALLY_HIDDEN =
  "position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0";

function renderTaskItem(node: JsonNode): VNode {
  const checked = node.attrs.checked === true;
  const label = taskItemLabel(node);
  return h("li", { "data-checked": String(checked), "data-type": "taskItem" }, [
    h("label", { contenteditable: "false" }, [
      h("input", {
        type: "checkbox",
        checked,
        "aria-label": label,
        // Read-only: the box shows state but a click must not flip it, the
        // same as the editor's node view reverting a change when not editable.
        onClick: (e: Event) => e.preventDefault(),
        onMousedown: (e: Event) => e.preventDefault(),
      }),
      h("span", { style: VISUALLY_HIDDEN }, label),
    ]),
    h("div", renderBlocks(node.content)),
  ]);
}

function chip(component: Component, props: Record<string, unknown>): VNode {
  return h(component, props);
}

function renderNode(node: JsonNode): VNodeChild | null {
  const a = node.attrs;
  switch (node.type) {
    case "text":
      return node.text === "" ? null : node.text;
    case "hardBreak":
      return h("br");
    case "paragraph":
      return textblock("p", { style: alignStyle(a) }, node);
    case "heading": {
      const level = typeof a.level === "number" && a.level >= 1 && a.level <= 6 ? Math.trunc(a.level) : 1;
      return textblock(`h${level}`, { style: alignStyle(a) }, node);
    }
    case "blockquote":
      return h("blockquote", renderBlocks(node.content));
    case "bulletList":
      return h("ul", renderBlocks(node.content));
    case "orderedList": {
      const start = typeof a.start === "number" ? a.start : 1;
      const type = text(a.type);
      return h(
        "ol",
        { start: start !== 1 ? start : undefined, type: type && type !== "1" ? type : undefined },
        renderBlocks(node.content),
      );
    }
    case "listItem":
      return h("li", renderBlocks(node.content));
    case "taskList":
      return h("ul", { "data-type": "taskList" }, renderBlocks(node.content));
    case "taskItem":
      return renderTaskItem(node);
    case "codeBlock": {
      const language = text(a.language);
      return h("pre", [
        h(
          "code",
          { class: language ? `language-${language}` : undefined },
          withTrailingBreak(renderInline(node.content), node.content),
        ),
      ]);
    }
    case "horizontalRule":
      return h("hr");
    case "image": {
      const src = text(a.src);
      return h("img", {
        src: src !== undefined && isSafeImageSrc(src) ? src : undefined,
        alt: text(a.alt),
        title: text(a.title),
        width: scalar(a.width),
        height: scalar(a.height),
      });
    }
    case "table":
      return renderTable(node);
    case "tableRow":
      return h("tr", renderBlocks(node.content));
    case "tableHeader":
      return renderCell("th", node);
    case "tableCell":
      return renderCell("td", node);
    case "columns":
      return h("div", { "data-type": "columns" }, renderBlocks(node.content));
    case "aiGenerated":
      return h(
        "div",
        { "data-ai-generated": "true", "data-ai-model": text(a.model) || undefined },
        renderBlocks(node.content),
      );
    case "secretBlock":
      // Only a DM ever receives this node (the server strips it from every
      // player projection), so rendering it is safe; the frame and label that
      // set it apart come from `secret-block.css`.
      return h("div", { "data-type": "secretBlock" }, renderBlocks(node.content));
    case "calendarEventRef":
      return chip(CalendarEventRefChip, {
        eventId: text(a.eventId) ?? null,
        label: text(a.label) ?? "",
        editable: false,
      });
    case "entityMention": {
      const entityType = text(a.entityType);
      const id = text(a.id);
      // A mention with no target has nothing to resolve or link to.
      if (!entityType || !id) return null;
      return chip(EntityMentionChip, { entityType: entityType as EntityType, id, editable: false });
    }
    case "illustrationSuggestion":
      return chip(IllustrationSuggestionChip, { prompt: text(a.prompt) ?? "", editable: false });
    case "pendingImage":
      return chip(PendingImageCard, {
        status: text(a.status) ?? "pending",
        prompt: text(a.prompt) ?? "",
        startedAt: typeof a.startedAt === "number" ? a.startedAt : null,
        editable: false,
      });
    default:
      // A node type this viewer does not know (a newer editor, a removed
      // extension): show what it contains rather than crash or drop the text.
      return node.content.length > 0 ? h("div", renderBlocks(node.content)) : null;
  }
}

// ── Entry points ────────────────────────────────────────────────────────────

/**
 * Stored content is Tiptap JSON as an object or a JSON string. This returns
 * the document object, so the caller can hold one value and hand it back to
 * `renderStoredDoc` (and to the pending-image resolver, which edits it). A
 * string that is not JSON describing an object is stored text (imported
 * library descriptions are markdown-flavoured prose) and becomes a document
 * through `storedTextToDoc`.
 */
export function parseStoredContent(value: object | string | null | undefined): unknown {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return value;
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : storedTextToDoc(value);
  } catch {
    return storedTextToDoc(value);
  }
}

function emptyLine(): VNode {
  return h("p", [h("br", { class: "ProseMirror-trailingBreak" })]);
}

/**
 * The document wrapped like the read-only editor wrapped it: a `.ProseMirror`
 * element, which is what the viewer's stylesheet targets. A string is stored
 * text and renders through `storedTextToDoc`: escaped text, never markup.
 */
export function renderStoredDoc(content: unknown): VNode {
  // A raw string takes the same route as one read from storage.
  const root = toNode(typeof content === "string" ? parseStoredContent(content) : content);
  let children: VNodeChild[];
  if (root && root.type === "doc") {
    children = renderBlocks(root.content);
    // An empty document still shows one empty line, like an editor does.
    if (children.length === 0) children = [emptyLine()];
  } else {
    children = [emptyLine()];
  }
  return h("div", { class: "tiptap ProseMirror" }, children);
}

/*
 * A detached entry keeps the look it had while linked (#1176).
 *
 * A linked monster, NPC or item draws its body from the formatter's HTML, whose
 * look lives in `sc-*` classes (the white stat block box, the red labels, the
 * ability table, the art layout). Detach turns that body into ordinary editable
 * text, and the editor's schema used to throw the classes away with every
 * element it had no node for, so the entry changed shape the moment it stopped
 * being linked. These pieces let the schema carry the classes:
 *
 *   - ClassedBlock / ClassedLine: a `div` that carries an `sc-` class. A div
 *     that holds blocks is a ClassedBlock; one that holds only text and inline
 *     elements (an ability coin) is a ClassedLine, so its spans are not wrapped
 *     in a paragraph.
 *   - ScClass: an `sc-` class on a paragraph or a heading.
 *   - ClassedSpan: a `span`, kept as its own element.
 *   - EntryArt: the entry's picture, with its class and `data-art-kind`.
 *
 * Only `sc-` classes are ever kept, so pasted HTML cannot bring its own styling
 * in. Every custom block node parses `div[data-type=...]`; those keep winning
 * because the classed div refuses any div that has a `data-type`.
 */

import { Extension, Mark, Node, mergeAttributes } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";

/** Classes that other nodes own (drop cap) or that only the editor's own page flow draws. */
function isEntryClass(token: string): boolean {
  return token.startsWith("sc-") && token !== "sc-drop-cap" && !token.startsWith("sc-flow-");
}

/** The `sc-` classes of an element as one string, or null when it has none. */
export function scClasses(el: Element): string | null {
  const kept = (el.getAttribute("class") ?? "").split(/\s+/).filter(isEntryClass);
  return kept.length > 0 ? kept.join(" ") : null;
}

const CLASS_ATTRIBUTE = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => scClasses(el),
  renderHTML: (attrs: { class?: string | null }) => (attrs.class ? { class: attrs.class } : {}),
};

/** The only `data-*` attributes an entry's markup carries, besides the ones other nodes own. */
const BAND_POSITION_ATTRIBUTE = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute("data-band-position"),
  renderHTML: (attrs: { bandPosition?: string | null }) =>
    attrs.bandPosition ? { "data-band-position": attrs.bandPosition } : {},
};
const LABEL_ATTRIBUTE = {
  default: null as string | null,
  parseHTML: (el: HTMLElement) => el.getAttribute("data-label"),
  renderHTML: (attrs: { label?: string | null }) =>
    attrs.label ? { "data-label": attrs.label } : {},
};

const BLOCK_TAGS = new Set([
  "DIV", "P", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "UL", "OL", "BLOCKQUOTE", "IMG", "PRE", "HR",
]);

type DivShape = "blocks" | "inline";

/** Which node a classed div becomes: blocks inside, or only text and inline elements. */
function divShape(el: HTMLElement): DivShape {
  const hasBlockChild = Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName));
  if (hasBlockChild) return "blocks";
  return el.childNodes.length > 0 ? "inline" : "blocks";
}

function classedDivAttrs(el: HTMLElement, shape: DivShape): false | null {
  // The image node draws its own wrapper and reads only the picture out of it.
  if (el.hasAttribute("data-type") || el.classList.contains("sc-img-wrap") || scClasses(el) === null) {
    return false;
  }
  return divShape(el) === shape ? null : false;
}

export const ClassedBlock = Node.create({
  name: "classedBlock",
  group: "block",
  content: "block*",
  defining: true,

  addAttributes() {
    return { class: CLASS_ATTRIBUTE, bandPosition: BAND_POSITION_ATTRIBUTE, label: LABEL_ATTRIBUTE };
  },

  parseHTML() {
    return [{ tag: "div", priority: 40, getAttrs: (el) => classedDivAttrs(el, "blocks") }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },
});

export const ClassedLine = Node.create({
  name: "classedLine",
  group: "block",
  content: "inline*",
  defining: true,

  addAttributes() {
    return { class: CLASS_ATTRIBUTE, label: LABEL_ATTRIBUTE };
  },

  parseHTML() {
    return [{ tag: "div", priority: 40, getAttrs: (el) => classedDivAttrs(el, "inline") }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", HTMLAttributes, 0];
  },
});

/** An `sc-` class on a paragraph or heading (the stat block's name, type and property lines). */
export const ScClass = Extension.create({
  name: "scClass",

  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: { class: { ...CLASS_ATTRIBUTE, keepOnSplit: false } },
      },
    ];
  },
});

/**
 * A span kept as its own element. The AC and Initiative row is two unclassed
 * spans side by side, and the stylesheet lays them out as two items, so two
 * spans with the same marks must not merge into one. Every parsed span gets a
 * unique `uid`, which makes its mark different from its neighbour's, and the
 * mark ranks before bold and italic so the span stays the outer element
 * around the `<strong>` inside it. A span is only kept where an entry is
 * meant to have one (it has a class, a `data-label`, or sits in an `sc-`
 * element), so pasted web text does not fill up with empty spans.
 */
export const ClassedSpan = Mark.create({
  name: "classedSpan",
  priority: 1100,
  excludes: "",
  inclusive: false,

  addAttributes() {
    return {
      class: CLASS_ATTRIBUTE,
      label: LABEL_ATTRIBUTE,
      uid: {
        default: null as string | null,
        parseHTML: () => crypto.randomUUID(),
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span",
        priority: 40,
        getAttrs: (el) => {
          // A span with a data-type is another node's (the horizontal spacer).
          if (el.hasAttribute("data-type")) return false;
          const keeps =
            scClasses(el) !== null ||
            el.hasAttribute("data-label") ||
            (el.parentElement !== null && scClasses(el.parentElement) !== null);
          return keeps ? null : false;
        },
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", HTMLAttributes, 0];
  },
});

/**
 * The entry's picture. The editor's own image node lays a picture out itself
 * (width, float, a wrapper), which would fight the entry's CSS grid, so the
 * entry's picture is its own node that renders the bare `<img>`.
 */
export const EntryArt = Node.create({
  name: "entryArt",
  group: "block",
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      src: { default: null as string | null, parseHTML: (el: HTMLElement) => el.getAttribute("src") },
      alt: { default: null as string | null, parseHTML: (el: HTMLElement) => el.getAttribute("alt") },
      class: CLASS_ATTRIBUTE,
      artKind: {
        default: null as string | null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-art-kind"),
        renderHTML: (attrs: { artKind?: string | null }) =>
          attrs.artKind ? { "data-art-kind": attrs.artKind } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "img.sc-entity-art", priority: 1000 }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes)];
  },
});

export const detachedEntryExtensions = () => [ClassedBlock, ClassedLine, ScClass, ClassedSpan, EntryArt];

/**
 * Where a detached entry that started its own page needs a page break, or null
 * when nothing is needed. A linked monster starts a fresh page by default
 * (`startsPage`, printed as `sc-entity-embed--startpage`), and a heading right
 * before it moves to that page with it (pagedPreviewCss.ts); the detached copy
 * has no such class, so Detach puts a real break there instead, or the book's
 * pages shift. No break at the very start of the document or right after one.
 * `pos` is where the entry starts.
 */
export function detachedEntryBreakAt(doc: PmNode, pos: number): number | null {
  const before = doc.resolve(pos).nodeBefore;
  const at = before?.type.name === "heading" && before.attrs.level === 2 ? pos - before.nodeSize : pos;
  const $at = doc.resolve(at);
  if ($at.parentOffset === 0) return null;
  return $at.nodeBefore?.type.name === "pageBreak" ? null : at;
}

/**
 * Where a chapter's Tiptap JSON becomes the HTML the book is laid out from
 * (#1115). The preview, Inspect and the PDF export all read their chapters
 * through here, so what a DM-only passage or a lens pair does on paper is
 * decided in exactly one place.
 *
 *  - A `secretBlock` ("Only you see this") never prints and never previews, in
 *    a book or a handout. It is taken out of the JSON before anything is
 *    serialised, so no CSS is ever asked to hide it.
 *  - A handout's preview and print are what its players see, so a lens pair
 *    becomes its Bright half's blocks and the Deep half goes, the same
 *    projection the server makes for the player read
 *    (`private.strip_secret_nodes`, migration 20261027012548). A book prints
 *    both readings.
 */
import { getSchema } from "@tiptap/core";
import type { JSONContent } from "@tiptap/core";
import { DOMSerializer, Node as ProseMirrorNode, type Schema } from "@tiptap/pm/model";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import type { ScriptoriumKind } from "@/types/scriptorium.types";

const EMPTY_DOC_FILL: JSONContent = { type: "paragraph" };
/** Containers that must keep a child: an emptied one gets a blank paragraph, as the server does. */
const REFILLED = new Set(["doc", "tableCell", "tableHeader"]);

function bodyOf(node: JSONContent): JSONContent[] {
  return node.content ?? [];
}

function project(nodes: readonly JSONContent[], kind: ScriptoriumKind): JSONContent[] {
  const out: JSONContent[] = [];
  for (const node of nodes) {
    if (node.type === "secretBlock") continue;
    if (kind === "handout") {
      if (node.type === "lensDeep") continue;
      
      if (node.type === "lensBright") {
        out.push(...project(bodyOf(node), kind));
        continue;
      }
      if (node.type === "lensPair") {
        const bright = bodyOf(node).filter((half) => half.type === "lensBright");
        out.push(...project(bright, kind));
        continue;
      }
    }
    if (!node.content) {
      out.push(node);
      continue;
    }
    const content = project(node.content, kind);
    if (content.length === 0 && node.content.length > 0) {
      if (node.type && REFILLED.has(node.type)) out.push({ ...node, content: [EMPTY_DOC_FILL] });
      continue;
    }
    out.push({ ...node, content });
  }
  return out;
}

/** The chapter as the page may show it: DM-only blocks gone and, for a handout, the Deep halves with them. */
export function contentForLayout(doc: JSONContent, kind: ScriptoriumKind): JSONContent {
  const content = project(bodyOf(doc), kind);
  return { ...doc, content: content.length > 0 ? content : [EMPTY_DOC_FILL] };
}

let schemaCache: Schema | null = null;
function schema(): Schema {
  schemaCache ??= getSchema(createScriptoriumExtensions());
  return schemaCache;
}

/** What `editor.getHTML()` would return for this JSON, without an editor. */
export function jsonToHtml(doc: JSONContent): string {
  const s = schema();
  const fragment = DOMSerializer.fromSchema(s).serializeFragment(ProseMirrorNode.fromJSON(s, doc).content);
  const holder = document.createElement("div");
  holder.appendChild(fragment);
  return holder.innerHTML;
}

/** One chapter's HTML for the book layout. A blank chapter is the engine's to skip (createBookLayout). */
export function chapterLayoutHtml(doc: JSONContent, kind: ScriptoriumKind): string {
  return jsonToHtml(contentForLayout(doc, kind));
}

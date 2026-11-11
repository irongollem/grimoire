/*
 * Asking a linked entry to open or detach itself (#1176).
 *
 * The entry's own node view knows what it is showing (a detach turns exactly
 * that into plain content) and holds the router, so the panel does not redo
 * either. It says so on the entry's element and the view answers. The same
 * way the two-column warning asks the chapter editor to place a picture:
 * a DOM event, so neither side imports the other.
 */
import type { Editor } from "@tiptap/core";

export const EMBED_OPEN_EVENT = "sc-embed-open";
export const EMBED_DETACH_EVENT = "sc-embed-detach";

/** True when the entry at `pos` is drawn, and so heard. */
export function signalEmbed(editor: Editor, pos: number, event: typeof EMBED_OPEN_EVENT | typeof EMBED_DETACH_EVENT): boolean {
  if (editor.isDestroyed) return false;
  const dom = editor.view.nodeDOM(pos);
  if (!(dom instanceof HTMLElement)) return false;
  dom.dispatchEvent(new CustomEvent(event));
  return true;
}

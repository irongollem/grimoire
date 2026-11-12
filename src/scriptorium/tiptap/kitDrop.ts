import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import {
  KIT_MIME,
  currentKitDrag,
  dropCaption,
  endKitDrag,
  parseKitItem,
  type KitItem,
} from "@/scriptorium/lib/kit/kitItem";
import { placeKitItem } from "@/scriptorium/lib/kit/placeKitItem";
import { isTwoColumnPage } from "@/scriptorium/lib/kit/twoColumn";

interface DropLine {
  boundary: number;
  caption: string;
}
const dropKey = new PluginKey<DropLine | null>("scriptoriumKitDrop");

/** Where a kit item dropped at this point lands: a top-level boundary, and the position under the pointer. */
export function dropTarget(view: EditorView, x: number, y: number): { boundary: number; pointer: number } | null {
  const hit = view.posAtCoords({ left: x, top: y });
  if (!hit) return null;
  const $pos = view.state.doc.resolve(hit.pos);
  if ($pos.depth === 0) return { boundary: $pos.pos, pointer: hit.pos };
  const before = $pos.before(1);
  const dom = view.nodeDOM(before);
  if (!(dom instanceof HTMLElement)) return { boundary: $pos.after(1), pointer: hit.pos };
  const rect = dom.getBoundingClientRect();
  return { boundary: y < rect.top + rect.height / 2 ? before : $pos.after(1), pointer: hit.pos };
}

function lineElement(caption: string): HTMLElement {
  const line = document.createElement("div");
  line.className = "sc-drop-line";
  line.setAttribute("contenteditable", "false");
  const label = document.createElement("span");
  label.className = "sc-drop-line-label";
  label.textContent = caption;
  line.append(label);
  return line;
}

function carriesKit(event: DragEvent): boolean {
  return event.dataTransfer !== null && Array.from(event.dataTransfer.types).includes(KIT_MIME);
}

/**
 * Dropping a block, a campaign entry or a picture from the book kit onto the
 * page (#1176 frame 13). A drop line shows where it lands, at a boundary
 * between two top-level blocks, and the item is inserted as the same content
 * a click inserts (`placeKitItem`).
 */
export const KitDrop = Extension.create({
  name: "kitDrop",

  addProseMirrorPlugins() {
    const editor = this.editor;
    const setLine = (view: EditorView, line: DropLine | null) => {
      const now = dropKey.getState(view.state) ?? null;
      if (now?.boundary === line?.boundary && now?.caption === line?.caption) return;
      view.dispatch(view.state.tr.setMeta(dropKey, line));
    };
    return [
      new Plugin<DropLine | null>({
        key: dropKey,
        state: {
          init: () => null,
          apply(tr, value) {
            const meta: DropLine | null | undefined = tr.getMeta(dropKey);
            if (meta !== undefined) return meta;
            return value && tr.docChanged ? null : value;
          },
        },
        props: {
          decorations(state) {
            const line = dropKey.getState(state);
            if (!line) return null;
            return DecorationSet.create(state.doc, [
              Decoration.widget(line.boundary, () => lineElement(line.caption), { side: -1, key: `kit-drop:${line.boundary}:${line.caption}` }),
            ]);
          },
          handleDOMEvents: {
            dragover(view, event) {
              if (!editor.isEditable || !carriesKit(event)) return false;
              const target = dropTarget(view, event.clientX, event.clientY);
              const item = currentKitDrag();
              if (!target) return false;
              event.preventDefault();
              if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
              setLine(view, { boundary: target.boundary, caption: item ? dropCaption(item) : "Drop here" });
              return true;
            },
            dragleave(view, event) {
              const next = event.relatedTarget;
              if (next instanceof Node && view.dom.contains(next)) return false;
              setLine(view, null);
              return false;
            },
          },
          handleDrop(view, event) {
            if (!editor.isEditable || !carriesKit(event)) return false;
            setLine(view, null);
            const raw = event.dataTransfer?.getData(KIT_MIME) ?? "";
            const item: KitItem | null = parseKitItem(raw) ?? currentKitDrag();
            endKitDrag();
            const target = dropTarget(view, event.clientX, event.clientY);
            if (!item || !target) return false;
            event.preventDefault();
            placeKitItem(editor, item, { at: target.boundary, pointer: target.pointer, isTwoColumn: isTwoColumnPage(editor) });
            return true;
          },
        },
      }),
    ];
  },
});

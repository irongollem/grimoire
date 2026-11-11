import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

/*
 * FurnitureUnderlay (#1175): a surface behind the editor's text, inside it.
 *
 * The editor's paper is painted on the ProseMirror root itself, so a layer
 * behind the root would be hidden by the paper. Instead one widget decoration
 * holds a full-size element with z-index -1; the root is an isolated stacking
 * context (scriptorium-editor.css), so that element paints above the root's
 * paper and below its text. Art "behind the text" is drawn into it.
 *
 * The widget sits at the end of the document, not the start: a first child
 * would break `p:first-child` rules such as the placeholder's. Order does not
 * matter to a z-index -1 box. The element is kept in storage and reused, so
 * what the furniture layer drew into it survives ProseMirror re-adding it.
 */

export interface FurnitureUnderlayStorage {
  element: HTMLElement | null;
  /** Called when the element is first created, so a layer that mounted earlier can draw into it. */
  listeners: Set<() => void>;
}

const key = new PluginKey("furnitureUnderlay");

export const FurnitureUnderlay = Extension.create<Record<string, never>, FurnitureUnderlayStorage>({
  name: "furnitureUnderlay",

  addStorage() {
    return { element: null, listeners: new Set<() => void>() };
  },

  addProseMirrorPlugins() {
    const storage = this.storage;
    const toDOM = (): HTMLElement => {
      if (storage.element) return storage.element;
      const el = document.createElement("div");
      el.className = "sc-furniture-underlay";
      el.contentEditable = "false";
      el.setAttribute("aria-hidden", "true");
      storage.element = el;
      // A microtask: the widget is created while the view renders.
      queueMicrotask(() => storage.listeners.forEach((fn) => fn()));
      return el;
    };
    return [
      new Plugin({
        key,
        props: {
          decorations: (state) =>
            DecorationSet.create(state.doc, [
              Decoration.widget(state.doc.content.size, toDOM, {
                key: "furniture-underlay",
                side: 2,
                ignoreSelection: true,
                // Nothing in it is the editor's to handle.
                stopEvent: () => true,
              }),
            ]),
        },
      }),
    ];
  },
});

import { Extension } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import { VueRenderer } from "@tiptap/vue-3";
import SlashMenuList from "@/scriptorium/components/kit/SlashMenuList.vue";
import { BLOCK_REGISTRY, type BlockEntry } from "@/scriptorium/lib/blockRegistry";
import { placeKitItem } from "@/scriptorium/lib/kit/placeKitItem";
import { isTwoColumnPage } from "@/scriptorium/lib/kit/twoColumn";

export const slashKey = new PluginKey("scriptoriumSlashMenu");

/** The blocks that match what was typed after the "/", by name or short name. */
export function slashItems(query: string, available: (entry: BlockEntry) => boolean): BlockEntry[] {
  const q = query.trim().toLowerCase();
  return BLOCK_REGISTRY.filter((entry) => {
    if (!entry.action || !available(entry)) return false;
    return q === "" || entry.label.toLowerCase().includes(q) || (entry.kit?.toLowerCase().includes(q) ?? false);
  });
}

/**
 * "/" on an empty line opens a menu of every block (#1176 frame 13); choosing
 * one takes the "/" line out and inserts the block in its place. Only on a line
 * that holds nothing but the slash and what follows it, so a slash in running
 * text is just a slash.
 */
export const SlashMenu = Extension.create({
  name: "slashMenu",

  addProseMirrorPlugins() {
    const editor = this.editor;
    const available = (entry: BlockEntry) => !entry.enabled || entry.enabled(editor, { isTwoColumn: isTwoColumnPage(editor) });
    return [
      Suggestion<BlockEntry, BlockEntry>({
        editor,
        pluginKey: slashKey,
        char: "/",
        startOfLine: true,
        allow: ({ state, range }) => {
          if (!editor.isEditable) return false;
          const $from = state.doc.resolve(range.from);
          return $from.parent.type.name === "paragraph" && $from.parent.textContent === state.doc.textBetween(range.from, range.to);
        },
        items: ({ query }) => slashItems(query, available),
        command: ({ editor: ed, range, props: entry }) => {
          ed.chain().focus().deleteRange(range).run();
          placeKitItem(ed, { kind: "block", label: entry.label }, { isTwoColumn: isTwoColumnPage(ed) });
        },
        render: () => {
          let list: VueRenderer | null = null;
          let unmount: (() => void) | null = null;
          const stop = () => {
            unmount?.();
            list?.destroy();
            unmount = null;
            list = null;
          };
          return {
            onStart(props) {
              list = new VueRenderer(SlashMenuList, { props: { items: props.items, command: props.command }, editor: props.editor });
              unmount = props.mount(list.element as HTMLElement);
            },
            onUpdate(props) {
              list?.updateProps({ items: props.items, command: props.command });
            },
            onKeyDown(props) {
              const handler: { onKeyDown?: (p: typeof props) => boolean } | null = list?.ref ?? null;
              return handler?.onKeyDown?.(props) === true;
            },
            onExit: stop,
          };
        },
      }),
    ];
  },
});

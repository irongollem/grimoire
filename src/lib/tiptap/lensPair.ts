import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import LensPairView from "@/components/scriptorium/LensPairView.vue";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    lensPair: {
      /** Insert a lens pair (Bright half, then Deep half) at the selection. */
      insertLensPair: () => ReturnType;
    };
  }
}

/*
 * The lens pair (#1115): one passage read at two levels. Bright is a child's
 * reading, Deep an adult's. A setting book prints both side by side; inside
 * entity rich text the DM sees both and a player sees only the Bright half.
 *
 * Structure is fixed: `lensPair` holds exactly one `lensBright` then one
 * `lensDeep`, so neither half can be deleted alone. The labels are rendered by
 * `renderHTML` outside the content hole (and marked non-editable), so they are
 * never document text. Their sun and moon glyphs are CSS masks rather than
 * inline SVG so the markup stays plain strings in every serializer.
 *
 * Styling lives in `theme-base.css` (the book) and `lens-pair.css` (entity text).
 * Hiding the Deep half from a player is the viewer's job (`viewerRender.ts`).
 */

export type LensVariant = "boxed" | "light";

export const BRIGHT_PLACEHOLDER = "What a child at the table sees…";
export const DEEP_PLACEHOLDER = "What an adult at the table understands…";

const EMPTY_PARAGRAPH = { type: "paragraph" } as const;

/** True for a half holding nothing but one empty paragraph. */
function isEmptyHalf(node: ProseMirrorNode): boolean {
  return node.childCount === 1 && node.firstChild?.type.name === "paragraph" && node.textContent === "";
}

function halfNode(name: "lensBright" | "lensDeep", label: string, placeholder: string) {
  return Node.create({
    name,
    content: "block+",
    defining: true,
    draggable: false,
    selectable: false,

    parseHTML() {
      return [{ tag: `div[data-type="${name}"]`, contentElement: ".sc-lens-body" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "div",
        mergeAttributes(
          { "data-type": name, class: `sc-lens-half sc-lens-${name === "lensBright" ? "bright" : "deep"}` },
          HTMLAttributes,
        ),
        ["div", { class: "sc-lens-label", contenteditable: "false" }, ["span", { class: "sc-lens-name" }, label]],
        ["div", { class: "sc-lens-body" }, 0],
      ];
    },

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey(`${name}Placeholder`),
          props: {
            decorations: (state) => {
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (node.type.name === name && isEmptyHalf(node)) {
                  decorations.push(
                    // On the paragraph itself: CSS cannot read an ancestor's attribute into ::before.
                    Decoration.node(pos + 1, pos + 1 + (node.firstChild?.nodeSize ?? 0), {
                      class: "is-empty",
                      "data-placeholder": placeholder,
                    }),
                  );
                }
                return true;
              });
              return DecorationSet.create(state.doc, decorations);
            },
          },
        }),
      ];
    },
  });
}

export const LensBright = halfNode("lensBright", "Bright", BRIGHT_PLACEHOLDER);
export const LensDeep = halfNode("lensDeep", "Deep", DEEP_PLACEHOLDER);

export const LensPair = Node.create({
  name: "lensPair",
  group: "block",
  content: "lensBright lensDeep",
  defining: true,
  isolating: true,

  addAttributes() {
    return {
      variant: {
        default: "boxed" as LensVariant,
        parseHTML: (el: HTMLElement): LensVariant => (el.getAttribute("data-variant") === "light" ? "light" : "boxed"),
        renderHTML: (attrs: { variant?: LensVariant }) => ({ "data-variant": attrs.variant === "light" ? "light" : "boxed" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="lensPair"]' }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const light = node.attrs.variant === "light";
    return [
      "div",
      mergeAttributes({ "data-type": "lensPair", class: light ? "sc-lens sc-lens--light" : "sc-lens" }, HTMLAttributes),
      0,
    ];
  },

  addNodeView() {
    return VueNodeViewRenderer(LensPairView);
  },

  addCommands() {
    return {
      insertLensPair:
        () =>
        ({ commands, state }) => {
          // A half takes any block, so the schema would allow a pair inside a
          // pair; refuse here instead. The toolbar button is disabled to match.
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type.name === "lensPair") return false;
          }
          return commands.insertContent({
            type: this.name,
            attrs: { variant: "boxed" },
            content: [
              { type: "lensBright", content: [EMPTY_PARAGRAPH] },
              { type: "lensDeep", content: [EMPTY_PARAGRAPH] },
            ],
          });
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      "Mod-Alt-l": () => this.editor.commands.insertLensPair(),
    };
  },
});

/** The three nodes together, in registration order. */
export const LENS_PAIR_EXTENSIONS = [LensPair, LensBright, LensDeep];

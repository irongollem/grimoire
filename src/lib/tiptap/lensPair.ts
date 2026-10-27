import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";
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
 * Withholding the Deep half from a player is the server's job
 * (`private.withhold_secret_blocks`); the viewer hides it as well (`viewerRender.ts`).
 *
 * The nodes are registered in every editor, so stored content survives a load,
 * but only a `creatable` editor makes new ones. Elsewhere the shortcut and the
 * command do nothing and a pasted or dropped pair arrives as its Bright half
 * alone, so a Deep reading cannot be put into a field players read unstripped.
 */

export type { LensVariant } from "@/lib/tiptap/nodeViewTypes";
import type { LensVariant } from "@/lib/tiptap/nodeViewTypes";

export const BRIGHT_PLACEHOLDER = "What a child at the table sees…";
export const DEEP_PLACEHOLDER = "What an adult at the table understands…";

const EMPTY_PARAGRAPH = { type: "paragraph" } as const;

/** True for a half holding nothing but one empty paragraph. */
function isEmptyHalf(node: ProseMirrorNode): boolean {
  return node.childCount === 1 && node.firstChild?.type.name === "paragraph" && node.textContent === "";
}

const PLACEHOLDERS: Record<string, string> = { lensBright: BRIGHT_PLACEHOLDER, lensDeep: DEEP_PLACEHOLDER };

/** The "is-empty" hint on each empty half's paragraph. CSS cannot read an ancestor's attribute into ::before. */
function placeholderDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];
  doc.descendants((node, pos) => {
    const placeholder = PLACEHOLDERS[node.type.name];
    if (placeholder && isEmptyHalf(node)) {
      decorations.push(
        Decoration.node(pos + 1, pos + 1 + (node.firstChild?.nodeSize ?? 0), {
          class: "is-empty",
          "data-placeholder": placeholder,
        }),
      );
    }
    // A pair is a block, so it can sit in any block container, never in text:
    // skipping textblocks keeps the walk to the block skeleton of a long book.
    return !node.isTextblock;
  });
  return DecorationSet.create(doc, decorations);
}

const LENS_NODES = new Set(["lensPair", "lensBright", "lensDeep"]);

/**
 * A pasted fragment with every lens node unwrapped and every whole Deep half
 * dropped, so a pair arrives as its Bright half alone. A Deep half the slice is
 * open into is unwrapped instead: that is text the DM selected inside it and
 * chose to paste, which is sharing a Deep line on purpose. `openStart` and
 * `openEnd` are the depths still open at this fragment's edges.
 */
function brightOnly(fragment: Fragment, openStart: number, openEnd: number): Fragment {
  const nodes: ProseMirrorNode[] = [];
  const last = fragment.childCount - 1;
  fragment.forEach((node, _offset, index) => {
    const innerStart = index === 0 ? Math.max(openStart - 1, 0) : 0;
    const innerEnd = index === last ? Math.max(openEnd - 1, 0) : 0;
    const open = (index === 0 && openStart > 0) || (index === last && openEnd > 0);
    if (node.isText) {
      nodes.push(node);
    } else if (LENS_NODES.has(node.type.name)) {
      if (node.type.name === "lensDeep" && !open) return;
      brightOnly(node.content, innerStart, innerEnd).forEach((child) => nodes.push(child));
    } else {
      nodes.push(node.copy(brightOnly(node.content, innerStart, innerEnd)));
    }
  });
  return Fragment.fromArray(nodes);
}

function holdsLensNode(fragment: Fragment): boolean {
  let found = false;
  fragment.descendants((node) => {
    if (LENS_NODES.has(node.type.name)) found = true;
    return !found;
  });
  return found;
}

/** The paste filter for an editor that may not create a pair. */
function pastedBrightOnly(slice: Slice): Slice {
  if (!holdsLensNode(slice.content)) return slice;
  return Slice.maxOpen(brightOnly(slice.content, slice.openStart, slice.openEnd));
}

function halfNode(name: "lensBright" | "lensDeep", label: string) {
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
  });
}

export const LensBright = halfNode("lensBright", "Bright");
export const LensDeep = halfNode("lensDeep", "Deep");

export const LensPair = Node.create<{ creatable: boolean }>({
  name: "lensPair",
  group: "block",
  content: "lensBright lensDeep",
  defining: true,
  isolating: true,

  addOptions() {
    return { creatable: false };
  },

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
          if (!this.options.creatable) return false;
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

  addProseMirrorPlugins() {
    const creatable = this.options.creatable;
    return [
      new Plugin<DecorationSet>({
        key: new PluginKey("lensPairPlaceholders"),
        // Recomputed only when the document changes, not on every selection move.
        state: {
          init: (_config, state) => placeholderDecorations(state.doc),
          apply: (tr, previous) => (tr.docChanged ? placeholderDecorations(tr.doc) : previous),
        },
        props: {
          decorations(state) {
            return this.getState(state);
          },
          ...(creatable
            ? {}
            : { transformPasted: pastedBrightOnly }),
        },
      }),
    ];
  },
});

/**
 * The three nodes together, in registration order. `creatable` only where the
 * Deep half is safe: a field the server strips (`allowSecrets`), one players
 * never read, or the Scriptorium (whose handouts refuse a pair server-side).
 */
export function lensPairExtensions({ creatable }: { creatable: boolean }) {
  return [LensPair.configure({ creatable }), LensBright, LensDeep];
}

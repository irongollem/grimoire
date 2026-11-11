import { Node } from "@tiptap/core";

/*
 * Divider: the fine rule under a chapter's title block, with a small ornament
 * in its middle. A supplement opens a chapter on a title, a subtitle and then
 * this mark, before the body text.
 *
 * It is not an `<hr>`: in this codebase an `hr` is a legacy page break in print
 * (theme-base.css, pageBreak.ts) and StarterKit's horizontalRule owns that tag.
 * It renders `div.sc-divider`, and theme-base.css draws the ornament in the
 * look's accent colour.
 */

export const DIVIDER_VARIANTS = ["flourish", "rule", "stars"] as const;
export type DividerVariant = (typeof DIVIDER_VARIANTS)[number];

/** Anything stored or pasted that is not one of the three styles reads as the default. */
export function dividerVariant(value: unknown): DividerVariant {
  return DIVIDER_VARIANTS.find((v) => v === value) ?? "flourish";
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    divider: {
      /** Insert a divider of the given style (the flourish by default). */
      insertDivider: (variant?: DividerVariant) => ReturnType;
    };
  }
}

export const Divider = Node.create({
  name: "divider",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      variant: {
        default: "flourish",
        parseHTML: (el: HTMLElement) => dividerVariant(el.getAttribute("data-variant")),
        renderHTML: (attrs: { variant?: unknown }) => ({ "data-variant": dividerVariant(attrs.variant) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="divider"]' }];
  },

  renderHTML({ node }) {
    const variant = dividerVariant(node.attrs.variant);
    return ["div", { "data-type": "divider", "data-variant": variant, class: `sc-divider sc-divider--${variant}` }];
  },

  addCommands() {
    return {
      insertDivider:
        (variant = "flourish") =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { variant } }),
    };
  },
});

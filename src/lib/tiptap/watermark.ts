import { Node, mergeAttributes } from "@tiptap/core";

export interface WatermarkAttrs {
  /** The text to display diagonally across the page. */
  text: string;
  /** Rotation in degrees (positive = clockwise). Default: -30. */
  rotation: number;
  /** Opacity 0–100. Default: 15. */
  opacity: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    watermark: {
      insertWatermark: (attrs?: Partial<WatermarkAttrs>) => ReturnType;
    };
  }
}

/**
 * Watermark overlay — large diagonal small-caps text spanning the page.
 *
 * Sits at `z-index: -1` inside a positioned wrapper so it appears behind
 * normal body content. Useful for "DRAFT", "PLAYTEST", "COPY", etc.
 *
 * Both themes reuse this node; the text colour derives from `--sc-accent`.
 */
export const Watermark = Node.create({
  name: "watermark",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: "DRAFT",
        parseHTML: (el) => el.getAttribute("data-text") ?? "DRAFT",
        renderHTML: (attrs) => ({ "data-text": attrs.text }),
      },
      rotation: {
        default: -30,
        parseHTML: (el) => {
          const v = parseInt(el.getAttribute("data-rotation") ?? "-30", 10);
          return isNaN(v) ? -30 : v;
        },
        renderHTML: (attrs) => ({ "data-rotation": String(attrs.rotation) }),
      },
      opacity: {
        default: 15,
        parseHTML: (el) => {
          const v = parseInt(el.getAttribute("data-opacity") ?? "15", 10);
          return isNaN(v) ? 15 : Math.max(0, Math.min(100, v));
        },
        renderHTML: (attrs) => ({ "data-opacity": String(attrs.opacity) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="watermark"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as WatermarkAttrs;

    // Wrapper: absolutely fills the page, sets the stacking context so we can
    // push the text behind content without affecting siblings.
    const wrapperStyle = [
      "position:absolute",
      "inset:0",
      "display:flex",
      "align-items:center",
      "justify-content:center",
      "pointer-events:none",
      "overflow:hidden",
      "z-index:0",
    ].join(";");

    const textStyle = [
      "font-family:var(--sc-heading-font,Georgia,serif)",
      "font-size:7rem",
      "font-variant:small-caps",
      "font-weight:700",
      "letter-spacing:0.15em",
      "color:var(--sc-decoration-watermark,var(--sc-accent,#1B3A4B))",
      `opacity:${attrs.opacity / 100}`,
      `transform:rotate(${attrs.rotation}deg)`,
      "white-space:nowrap",
      "user-select:none",
      "z-index:-1",
      "position:relative",
    ].join(";");

    return [
      "div",
      mergeAttributes({ "data-type": "watermark", style: wrapperStyle }, HTMLAttributes),
      ["span", { style: textStyle }, attrs.text],
    ];
  },

  addCommands() {
    return {
      insertWatermark:
        (attrs?: Partial<WatermarkAttrs>) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "watermark",
            attrs: attrs ?? {},
          });
        },
    };
  },
});

import { Node, mergeAttributes } from "@tiptap/core";
import { watercolorSrc } from "@/lib/scriptorium/furniture/watercolorAssets";

export type WatercolorVariant = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface WatercolorAttrs {
  /** Splatter variant 1–12. */
  variant: WatercolorVariant;
  /** CSS top value (e.g. "20px", "10%"). */
  top: string;
  /** CSS left value (e.g. "30px", "5%"). */
  left: string;
  /** CSS width value (e.g. "300px"). */
  width: string;
  /** Hex color for the hue-rotate tint (e.g. "#BBAD82"). */
  color: string;
  /** Opacity 0–100. */
  opacity: number;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    watercolor: {
      insertWatercolor: (attrs?: Partial<WatercolorAttrs>) => ReturnType;
    };
  }
}

/**
 * Watercolor splatter overlay — an absolutely-positioned decorative blob.
 *
 * Rendered as an <img> pointing to one of 12 SVG/PNG splatter assets in
 * `/assets/scriptorium/watercolor/`. The element is positioned relative to
 * the nearest `.phb-page` ancestor and sits above the page background but
 * below body text via `z-index`.
 *
 * Both themes share the same assets; the default `color` attr differs per
 * theme (teal for 2024, tan for classic) but either value can be used in
 * either theme.
 */
export const Watercolor = Node.create({
  name: "watercolor",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      variant: {
        default: 1,
        parseHTML: (el) => {
          const v = parseInt(el.getAttribute("data-variant") ?? "1", 10);
          return (v >= 1 && v <= 12 ? v : 1) as WatercolorVariant;
        },
        renderHTML: (attrs) => ({ "data-variant": String(attrs.variant) }),
      },
      top: {
        default: "0px",
        parseHTML: (el) => el.getAttribute("data-top") ?? "0px",
        renderHTML: (attrs) => ({ "data-top": attrs.top }),
      },
      left: {
        default: "0px",
        parseHTML: (el) => el.getAttribute("data-left") ?? "0px",
        renderHTML: (attrs) => ({ "data-left": attrs.left }),
      },
      width: {
        default: "300px",
        parseHTML: (el) => el.getAttribute("data-width") ?? "300px",
        renderHTML: (attrs) => ({ "data-width": attrs.width }),
      },
      color: {
        default: "#7d1c1c",
        parseHTML: (el) => el.getAttribute("data-color") ?? "#7d1c1c",
        renderHTML: (attrs) => ({ "data-color": attrs.color }),
      },
      opacity: {
        default: 80,
        parseHTML: (el) => {
          const v = parseInt(el.getAttribute("data-opacity") ?? "80", 10);
          return isNaN(v) ? 80 : Math.max(0, Math.min(100, v));
        },
        renderHTML: (attrs) => ({ "data-opacity": String(attrs.opacity) }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-type="watercolor"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as WatercolorAttrs;
    const src = watercolorSrc(attrs.variant);
    const style = [
      "position:absolute",
      `top:${attrs.top}`,
      `left:${attrs.left}`,
      `width:${attrs.width}`,
      "height:auto",
      `opacity:${attrs.opacity / 100}`,
      "mix-blend-mode:multiply",
      `filter:hue-rotate(${hueRotateForColor(attrs.color)}deg) saturate(1.4)`,
      "pointer-events:none",
      "z-index:0",
    ].join(";");

    return [
      "img",
      mergeAttributes(
        { "data-type": "watercolor", src, alt: "", style },
        HTMLAttributes,
      ),
    ];
  },

  addCommands() {
    return {
      insertWatercolor:
        (attrs?: Partial<WatercolorAttrs>) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "watercolor",
            attrs: attrs ?? {},
          });
        },
    };
  },
});

/**
 * Very approximate hue rotation from a hex colour.
 *
 * This converts the target colour to HSL and returns the hue in degrees
 * so CSS `hue-rotate()` can shift the watercolor asset (which is a
 * desaturated dark blob) toward the requested tint.
 */
export function hueRotateForColor(hex: string): number {
  // Strip leading #
  const clean = hex.replace(/^#/, "");
  if (clean.length !== 6) return 0;
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return 0;
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return Math.round(h * 360);
}

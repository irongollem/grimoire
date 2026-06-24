import { h, type FunctionalComponent, type SVGAttributes } from "vue";

/**
 * Build a drop-in icon component from inner SVG markup (a custom solid-fill
 * glyph). Renders an <svg> that inherits size from a class (e.g. `h-4 w-4`)
 * and colour from `currentColor`, matching how the Lucide icon components are
 * consumed — so these can replace them one-for-one in `icons.ts`.
 */
export function glyph(inner: string): FunctionalComponent<SVGAttributes> {
  const cmp: FunctionalComponent<SVGAttributes> = (_props, { attrs }) =>
    h("svg", {
      viewBox: "0 0 100 100",
      fill: "currentColor",
      "aria-hidden": "true",
      innerHTML: inner,
      ...attrs,
    });
  cmp.displayName = "Glyph";
  return cmp;
}

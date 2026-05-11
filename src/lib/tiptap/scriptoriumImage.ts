/*
 * Scriptorium-flavoured Tiptap Image extension.
 *
 * Adds: width (px), dataAlign (right/left/center → float / centering style),
 * layoutMode (inline / wrapLeft / wrapRight / absolute), gutterBleed flag, and
 * absolute-position offsets (posTop/posLeft/posRight/posBottom).
 *
 * In `inline` mode the node renders as a bare <img> with inline float style.
 * In wrap/absolute modes it renders inside a `<div class="sc-img-wrap …">`
 * wrapper so the layout classes land on a block-level container; the wrapper
 * also carries the absolute offsets when applicable.
 */

import Image from "@tiptap/extension-image";

export const ScriptoriumImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      // Explicit pixel width — html2canvas needs the attribute, not just CSS
      width: {
        default: "200",
        parseHTML: (el) => el.getAttribute("width") ?? "200",
        renderHTML: (attrs) => ({ width: attrs.width }),
      },
      // Alignment drives the inline style (float / centering)
      dataAlign: {
        default: "right",
        parseHTML: (el) => {
          const s = el.getAttribute("style") ?? "";
          if (s.includes("float:left")) return "left";
          if (s.includes("margin:8px auto")) return "center";
          return "right";
        },
        renderHTML: (attrs) => {
          const parts: string[] = [];
          if (attrs.dataAlign === "right") parts.push("float:right;margin:0 0 10px 14px");
          else if (attrs.dataAlign === "left") parts.push("float:left;margin:0 14px 10px 0");
          else if (attrs.dataAlign === "center") parts.push("display:block;margin:8px auto");
          if (attrs.width) parts.push(`width:${attrs.width}px`);
          return { style: parts.join(";") };
        },
      },
      layoutMode: {
        default: "inline",
        parseHTML: (el) => el.getAttribute("data-layout-mode") ?? "inline",
        renderHTML: (attrs) => ({
          "data-layout-mode": attrs.layoutMode ?? "inline",
        }),
      },
      // Gutter bleed: extends a wrap image into the column gutter (-3cm / ~-114px)
      gutterBleed: {
        default: false,
        parseHTML: (el) => el.getAttribute("data-gutter-bleed") === "true",
        renderHTML: (attrs) => ({
          "data-gutter-bleed": attrs.gutterBleed ? "true" : "false",
        }),
      },
      // Absolute-position offsets (CSS value strings, e.g. "60px")
      posTop:    posAttr("top"),
      posLeft:   posAttr("left"),
      posRight:  posAttr("right"),
      posBottom: posAttr("bottom"),
    };
  },
  renderHTML({ HTMLAttributes }) {
    const mode: string = HTMLAttributes["data-layout-mode"] ?? "inline";
    if (mode === "inline") return ["img", HTMLAttributes];

    const wrapperClass = [
      "sc-img-wrap",
      `sc-img-wrap--${mode}`,
      HTMLAttributes["data-gutter-bleed"] === "true" ? "sc-img-wrap--gutter" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const wrapperStyle: string[] = [];
    if (mode === "absolute") {
      const sides = ["data-pos-top", "data-pos-left", "data-pos-right", "data-pos-bottom"] as const;
      for (const side of sides) {
        const v = HTMLAttributes[side];
        if (v) wrapperStyle.push(`${side.replace("data-pos-", "")}:${v}`);
      }
      if (HTMLAttributes.width) wrapperStyle.push(`width:${HTMLAttributes.width}px`);
    }

    // In wrap/absolute the wrapper owns layout — strip the float style off the img.
    const imgAttrs = { ...HTMLAttributes };
    delete imgAttrs.style;

    return [
      "div",
      {
        class: wrapperClass,
        ...(wrapperStyle.length ? { style: wrapperStyle.join(";") } : {}),
      },
      ["img", imgAttrs],
    ];
  },
}).configure({ inline: false, allowBase64: false });

function posAttr(side: "top" | "left" | "right" | "bottom") {
  const dataKey = `data-pos-${side}`;
  const camelKey = `pos${side[0].toUpperCase()}${side.slice(1)}`;
  return {
    default: null as string | null,
    parseHTML: (el: HTMLElement) => el.getAttribute(dataKey) ?? null,
    renderHTML: (attrs: Record<string, unknown>) =>
      attrs[camelKey] ? { [dataKey]: attrs[camelKey] as string } : {},
  };
}

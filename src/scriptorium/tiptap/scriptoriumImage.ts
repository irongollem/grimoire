/*
 * Scriptorium-flavoured Tiptap Image extension.
 *
 * Adds: width (px, or a percentage string), dataAlign (right/left/center → float / centering style),
 * layoutMode (inline / wrapLeft / wrapRight) and a gutterBleed flag.
 *
 * A picture placed freely on the page is page furniture of kind "art"
 * (PageFurnitureItem), not an image mode. Old HTML saying
 * data-layout-mode="absolute" parses as inline.
 *
 * In `inline` mode the node renders as a bare <img> with inline float style.
 * In wrap modes it renders inside a `<div class="sc-img-wrap …">` wrapper so
 * the layout classes land on a block-level container.
 */

import Image from "@tiptap/extension-image";
import { parseSettings } from "@/scriptorium/illuminator/lib/treatment";
import { asBlend } from "@/scriptorium/lib/furniture/blend";

/**
 * A width as CSS: a bare number is pixels, a percentage stays a percentage (the
 * markdown importer writes "50%" / "100%"; appending "px" gave `width:50%px`).
 */
export function cssWidth(width: unknown): string {
  const value = String(width).trim();
  return value.endsWith("%") ? value : `${value}px`;
}

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
          // Whitespace-tolerant: a browser's own style-attribute reflection
          // reserializes "float:left" as "float: left;" (a colon-adjacent
          // space, semicolon added) the moment it's set via setAttribute, per
          // the CSSOM spec — not a parser quirk of one engine. A literal
          // substring match against the exact renderHTML output therefore
          // never matched on ANY HTML round trip (copy/paste in the galley,
          // or content ever set from an HTML string), silently resetting the
          // image back to right-aligned. Found via the #915 story 2 node
          // round-trip tests.
          const s = el.getAttribute("style") ?? "";
          if (/float\s*:\s*left/.test(s)) return "left";
          if (/margin\s*:\s*8px\s+auto/.test(s)) return "center";
          return "right";
        },
        renderHTML: (attrs) => {
          const parts: string[] = [];
          if (attrs.dataAlign === "right") parts.push("float:right;margin:0 0 10px 14px");
          else if (attrs.dataAlign === "left") parts.push("float:left;margin:0 14px 10px 0");
          else if (attrs.dataAlign === "center") parts.push("display:block;margin:8px auto");
          if (attrs.width) parts.push(`width:${cssWidth(attrs.width)}`);
          return { style: parts.join(";") };
        },
      },
      layoutMode: {
        default: "inline",
        parseHTML: (el) => {
          const mode = el.getAttribute("data-layout-mode");
          return mode === "wrapLeft" || mode === "wrapRight" ? mode : "inline";
        },
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
      // Keep a wrapped picture with its paragraph in print even when the
      // paragraph is long (#1176 story 11): the layout groups them, so the
      // browser can never push the picture into the next column alone.
      // Three ways: null (not chosen: the editor sets true the first time the
      // printer pushes it, see keepPushedPictures in pageFlow.ts), true, and
      // false (the DM unticked it: the printer may move it on alone).
      keepWithText: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-keep-with-text");
          return v === "true" ? true : v === "false" ? false : null;
        },
        renderHTML: (attrs) =>
          attrs.keepWithText === true
            ? { "data-keep-with-text": "true" }
            : attrs.keepWithText === false
              ? { "data-keep-with-text": "false" }
              : {},
      },
      // How it sits on the paper (#1176 story 9c): "paper" is printed into it (multiply), "top" is drawn as it is.
      // Unset means "top". The look's CSS draws it, in the editor and in print alike, and a player's copy keeps it.
      blend: {
        default: null,
        parseHTML: (el) => asBlend(el.getAttribute("data-blend")),
        renderHTML: (attrs) => {
          const blend = asBlend(attrs.blend);
          return blend ? { "data-blend": blend } : {};
        },
      },
      // A treated picture keeps its edits as a recipe (#1176 story 9): `original`
      // is the untouched picture, `illuminate` the steps (an object in the JSON,
      // JSON text in data-illuminate) and `bakedFor` the hash of the steps the
      // current src was baked from. Print renders the recipe over the original.
      original: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-original"),
        renderHTML: (attrs) => (attrs.original ? { "data-original": attrs.original } : {}),
      },
      illuminate: {
        default: null,
        parseHTML: (el) => parseSettings(el.getAttribute("data-illuminate")),
        renderHTML: (attrs) => (attrs.illuminate ? { "data-illuminate": JSON.stringify(attrs.illuminate) } : {}),
      },
      bakedFor: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-baked-for"),
        renderHTML: (attrs) => (attrs.bakedFor ? { "data-baked-for": attrs.bakedFor } : {}),
      },
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

    // In wrap modes the wrapper owns layout — strip the float style off the img.
    const imgAttrs = { ...HTMLAttributes };
    delete imgAttrs.style;

    return [
      "div",
      {
        class: wrapperClass,
      },
      ["img", imgAttrs],
    ];
  },
}).configure({ inline: false, allowBase64: false });

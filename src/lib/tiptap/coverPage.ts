import { Node, mergeAttributes } from "@tiptap/core";

export type CoverPageVariant = "front" | "inside" | "part" | "back";

export interface CoverPageAttrs {
  /** Which of the four cover variants this node represents. */
  variant: CoverPageVariant;
  /** Main title text. */
  title: string;
  /** Subtitle / tagline. */
  subtitle: string;
  /** For the "part" variant: the part number (e.g. "I", "1"). */
  partNumber: string;
  /** For the "back" variant: the first blurb paragraph. */
  blurb1: string;
  /** For the "back" variant: the second blurb paragraph. */
  blurb2: string;
  /** For the "back" variant: the third blurb paragraph. */
  blurb3: string;
  /** For the "back" variant: the tagline at the bottom. */
  tagline: string;
  /** For the "back" variant: the URL / product code. */
  productUrl: string;
  /**
   * Optional background image URL.
   * Authors replace this via the existing image toolbar / AssetInsertPanel.
   */
  backgroundImage: string;
}

function strAttr(key: string, fallback: string) {
  return {
    default: fallback,
    parseHTML: (el: HTMLElement) => el.getAttribute(`data-${key}`) ?? fallback,
    renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${key}`]: attrs[key] }),
  };
}

/**
 * CoverPage — full-page cover node with four visual variants.
 *
 * Variant rendering strategy:
 *   front   — title bar + art slot (full bleed) + subtitle + "HOMEBREW" banner
 *   inside  — art slot (upper half) + title + subtitle overlay at bottom
 *   part    — centred "PART N" + subtitle divider with ornamental rules
 *   back    — art strip + subtitle + three blurb paragraphs + tagline + URL
 *
 * A cover page occupies its own physical page. Insertion (via coverTemplates.ts
 * factories) wraps the node between two <hr> sentinels, which the Paged.js
 * renderer treats as page breaks (break-before: page) so the cover lands on
 * its own page. Front/back covers are left unnumbered by the footer pass
 * (see pageNumbering.ts / pagedFooters.ts).
 */
export const CoverPage = Node.create({
  name: "coverPage",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      variant: {
        default: "front" as CoverPageVariant,
        parseHTML: (el) =>
          (el.getAttribute("data-variant") as CoverPageVariant) ?? "front",
        renderHTML: (attrs) => ({ "data-variant": attrs.variant }),
      },
      title: strAttr("title", "Document Title"),
      subtitle: strAttr("subtitle", "Subtitle"),
      partNumber: strAttr("partNumber", "I"),
      blurb1: strAttr("blurb1", "Your adventure begins here. Replace this blurb with a compelling hook that draws readers in."),
      blurb2: strAttr("blurb2", "Describe the stakes, the world, or the conflict. Make it vivid."),
      blurb3: strAttr("blurb3", "A final line to close the back-cover pitch. Short and punchy."),
      tagline: strAttr("tagline", "An unofficial Grimoire supplement"),
      productUrl: strAttr("productUrl", "grimoire.example.com"),
      backgroundImage: strAttr("backgroundImage", ""),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="coverPage"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as CoverPageAttrs;
    const variant = attrs.variant ?? "front";
    const inner = buildCoverInner(variant, attrs);

    return [
      "div",
      mergeAttributes(
        {
          "data-type": "coverPage",
          "data-variant": variant,
          class: `sc-cover sc-cover--${variant}`,
        },
        HTMLAttributes,
      ),
      ...inner,
    ];
  },
});

// ---------------------------------------------------------------------------
// Internal HTML builders — each variant returns a ProseMirror renderHTML node
// spec (array tuples). We use inline styles only so the PDF html2canvas render
// captures them without a live stylesheet.
//
// Static style strings are module-level constants — they never change and
// hoisting avoids re-allocating arrays on every renderHTML call.
// ---------------------------------------------------------------------------

type NodeSpec = [string, Record<string, string>, ...(string | NodeSpec)[]];

function bgStyle(url: string): string {
  if (!url) return "";
  return `background-image:url('${url}');background-size:cover;background-position:center;`;
}

function buildCoverInner(variant: CoverPageVariant, attrs: CoverPageAttrs): NodeSpec[] {
  switch (variant) {
    case "front":  return buildFront(attrs);
    case "inside": return buildInside(attrs);
    case "part":   return buildPart(attrs);
    case "back":   return buildBack(attrs);
  }
}

// ── Front cover ──────────────────────────────────────────────────────────────

const FRONT_ART_IMG_STYLE =
  "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0;opacity:0.55";

const FRONT_ART_DIV_STYLE =
  "position:absolute;inset:0;width:100%;height:100%;z-index:0;" +
  "background:var(--sc-accent,#1B3A4B);opacity:0.18";

const FRONT_OVERLAY_STYLE =
  "position:absolute;inset:0;display:flex;flex-direction:column;" +
  "justify-content:space-between;z-index:1;padding:2.5rem";

const FRONT_TOP_BAR_STYLE =
  "background:var(--sc-title-bar-bg,var(--sc-accent,#1B3A4B));" +
  "color:var(--sc-title-bar-color,var(--sc-accent-contrast,#F9F6EF));" +
  "padding:0.75rem 1.25rem;margin:-2.5rem -2.5rem 0;" +
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:0.65rem;" +
  "font-weight:700;letter-spacing:0.18em;text-transform:uppercase;text-align:right";

const FRONT_TITLE_STYLE =
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:3.5rem;font-weight:700;" +
  "color:var(--sc-accent-contrast,#F9F6EF);text-shadow:0 2px 8px rgba(0,0,0,0.8);" +
  "line-height:1.1;letter-spacing:0.04em;margin:0";

const FRONT_SUBTITLE_STYLE =
  "font-family:var(--sc-body-font,Georgia,serif);font-size:1.15rem;" +
  "color:var(--sc-accent-contrast,#F9F6EF);text-shadow:0 1px 4px rgba(0,0,0,0.8);" +
  "font-style:italic;margin:0.5rem 0 0;opacity:0.9";

const FRONT_BOTTOM_BAR_STYLE =
  "background:var(--sc-accent,#1B3A4B);color:var(--sc-accent-contrast,#F9F6EF);" +
  "padding:0.6rem 1.25rem;margin:0 -2.5rem -2.5rem;" +
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:0.65rem;" +
  "letter-spacing:0.12em;text-transform:uppercase;text-align:center;opacity:0.85";

const FRONT_BODY_STYLE =
  "flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:1.5rem";

function buildFront(attrs: CoverPageAttrs): NodeSpec[] {
  const coverBg: NodeSpec = attrs.backgroundImage
    ? ["img", { src: attrs.backgroundImage, style: FRONT_ART_IMG_STYLE, alt: "" }]
    : ["div", { style: FRONT_ART_DIV_STYLE }];

  return [
    coverBg,
    [
      "div",
      { style: FRONT_OVERLAY_STYLE },
      ["div", { style: FRONT_TOP_BAR_STYLE }, "HOMEBREW"],
      [
        "div",
        { style: FRONT_BODY_STYLE },
        ["h1", { style: FRONT_TITLE_STYLE }, attrs.title],
        ["p", { style: FRONT_SUBTITLE_STYLE }, attrs.subtitle],
      ],
      ["div", { style: FRONT_BOTTOM_BAR_STYLE }, attrs.subtitle || "An Unofficial Supplement"],
    ],
  ];
}

// ── Inside cover ─────────────────────────────────────────────────────────────

const INSIDE_ART_IMG_STYLE =
  "position:absolute;inset:0;width:100%;height:60%;object-fit:cover;z-index:0";

const INSIDE_FADE_STYLE =
  "position:absolute;bottom:0;left:0;right:0;height:40%;" +
  "background:linear-gradient(to bottom,transparent,var(--sc-page-bg,#F9F6EF));z-index:1";

const INSIDE_TEXT_STYLE =
  "position:absolute;bottom:0;left:0;right:0;z-index:2;" +
  "padding:2rem 2.5rem 3rem;display:flex;flex-direction:column;align-items:center;text-align:center";

const INSIDE_TITLE_STYLE =
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:2.5rem;font-weight:700;" +
  "color:var(--sc-accent,#1B3A4B);line-height:1.15;margin:0 0 0.5rem;letter-spacing:0.03em";

const INSIDE_SUBTITLE_STYLE =
  "font-family:var(--sc-body-font,Georgia,serif);font-size:1rem;" +
  "color:var(--sc-ink,#1a1a1a);font-style:italic;margin:0;opacity:0.8";

function buildInside(attrs: CoverPageAttrs): NodeSpec[] {
  // When there's a background image use an <img> for proper CORS/html2canvas
  // handling; otherwise fall back to a CSS background-image on a <div>.
  const artEl: NodeSpec = attrs.backgroundImage
    ? ["img", { src: attrs.backgroundImage, style: INSIDE_ART_IMG_STYLE, alt: "" }]
    : [
        "div",
        {
          style:
            "position:absolute;top:0;left:0;right:0;height:60%;z-index:0;" +
            `background:var(--sc-accent,#1B3A4B);${bgStyle(attrs.backgroundImage)}` +
            "background-size:cover;background-position:center",
        },
      ];

  return [
    artEl,
    ["div", { style: INSIDE_FADE_STYLE }],
    [
      "div",
      { style: INSIDE_TEXT_STYLE },
      ["h1", { style: INSIDE_TITLE_STYLE }, attrs.title],
      ["p", { style: INSIDE_SUBTITLE_STYLE }, attrs.subtitle],
    ],
  ];
}

// ── Part divider ──────────────────────────────────────────────────────────────

const PART_CONTAINER_STYLE =
  "position:absolute;inset:0;display:flex;flex-direction:column;" +
  "align-items:center;justify-content:center;padding:3rem 2.5rem";

const PART_RULE_DOUBLE_STYLE =
  "border:none;border-top:3px double var(--sc-accent,#1B3A4B);width:80%;margin:0 0 1.5rem;opacity:0.3";

const PART_RULE_STYLE =
  "border:none;border-top:2px solid var(--sc-accent,#1B3A4B);width:60%;margin:1.25rem 0;opacity:0.4";

const PART_LABEL_STYLE =
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:0.7rem;font-weight:700;" +
  "letter-spacing:0.28em;text-transform:uppercase;color:var(--sc-accent,#1B3A4B);opacity:0.65;margin:0";

const PART_NUMBER_STYLE =
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:4.5rem;font-weight:700;" +
  "color:var(--sc-accent,#1B3A4B);line-height:1;margin:0.25rem 0 0;letter-spacing:0.04em";

const PART_SUBTITLE_STYLE =
  "font-family:var(--sc-body-font,Georgia,serif);font-size:1.05rem;" +
  "color:var(--sc-ink,#1a1a1a);font-style:italic;text-align:center;margin:0;opacity:0.75;max-width:22rem";

function buildPart(attrs: CoverPageAttrs): NodeSpec[] {
  return [
    [
      "div",
      { style: PART_CONTAINER_STYLE },
      ["hr", { style: PART_RULE_DOUBLE_STYLE }],
      ["p", { style: PART_LABEL_STYLE }, "Part"],
      ["p", { style: PART_NUMBER_STYLE }, attrs.partNumber],
      ["hr", { style: PART_RULE_STYLE }],
      ["p", { style: PART_SUBTITLE_STYLE }, attrs.subtitle],
    ],
  ];
}

// ── Back cover ───────────────────────────────────────────────────────────────

const BACK_CONTENT_STYLE =
  "position:absolute;top:35%;bottom:0;left:0;right:0;z-index:1;" +
  "padding:2rem 2.5rem;display:flex;flex-direction:column;justify-content:space-between";

const BACK_SUBTITLE_STYLE =
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:1.35rem;font-weight:700;" +
  "color:var(--sc-accent,#1B3A4B);margin:0 0 1rem;letter-spacing:0.03em";

const BACK_BLURB_STYLE =
  "font-family:var(--sc-body-font,Georgia,serif);font-size:0.875rem;" +
  "color:var(--sc-ink,#1a1a1a);line-height:1.6;margin:0 0 0.75rem";

const BACK_TAGLINE_STYLE =
  "font-family:var(--sc-body-font,Georgia,serif);font-size:0.8rem;" +
  "color:var(--sc-accent,#1B3A4B);font-style:italic;margin:0.5rem 0 0;opacity:0.8";

const BACK_BOTTOM_BAR_STYLE =
  "background:var(--sc-accent,#1B3A4B);color:var(--sc-accent-contrast,#F9F6EF);" +
  "padding:0.5rem 1rem;font-family:var(--sc-heading-font,Georgia,serif);font-size:0.6rem;" +
  "letter-spacing:0.1em;text-transform:uppercase;display:flex;align-items:center;justify-content:space-between";

function buildBack(attrs: CoverPageAttrs): NodeSpec[] {
  const artStripStyle =
    "width:100%;height:35%;position:absolute;top:0;left:0;right:0;z-index:0;" +
    `background:var(--sc-accent,#1B3A4B);${bgStyle(attrs.backgroundImage)}` +
    "background-size:cover;background-position:center;opacity:0.75";

  return [
    ["div", { style: artStripStyle }],
    [
      "div",
      { style: BACK_CONTENT_STYLE },
      [
        "div",
        { style: "flex:1" },
        ["p", { style: BACK_SUBTITLE_STYLE }, attrs.subtitle],
        ["p", { style: BACK_BLURB_STYLE }, attrs.blurb1],
        ["p", { style: BACK_BLURB_STYLE }, attrs.blurb2],
        ["p", { style: BACK_BLURB_STYLE }, attrs.blurb3],
        ["p", { style: BACK_TAGLINE_STYLE }, attrs.tagline],
      ],
      [
        "div",
        { style: BACK_BOTTOM_BAR_STYLE },
        ["span", {}, "HOMEBREW SUPPLEMENT"],
        ["span", {}, attrs.productUrl],
      ],
    ],
  ];
}

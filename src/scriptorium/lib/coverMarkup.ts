/*
 * The markup of the four covers (front, inside, part divider, back), shared by
 * the page (the coverPage node's renderHTML, which is what prints) and the
 * editor's own drawing of it (CoverPageView.vue, with `editing`). Kept apart
 * from the node so the view can import it without importing the node that
 * imports the view.
 */
import type { CoverPageVariant } from "@/lib/tiptap/nodeViewTypes";
export type { CoverPageVariant };

/** Where the title sits on a front cover. */
export type CoverTitlePlace = "top" | "middle" | "bottom";
export const COVER_TITLE_PLACES: readonly CoverTitlePlace[] = ["top", "middle", "bottom"];

/** What is laid under the title so it reads over the art. */
export type CoverShade = "none" | "dusk" | "parchment";
export const COVER_SHADES: readonly CoverShade[] = ["none", "dusk", "parchment"];

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
   * Authors replace it with Change art in the cover's panel section.
   */
  backgroundImage: string;
  /** Where the title sits (front cover). */
  titlePlace: CoverTitlePlace;
  /** The shade under the title (front cover). */
  shade: CoverShade;
}

/** The shade a cover draws: its own, dusk when it holds none that is valid. */
export function coverShade(attrs: Pick<CoverPageAttrs, "shade">): CoverShade {
  return COVER_SHADES.includes(attrs.shade) ? attrs.shade : "dusk";
}

// ---------------------------------------------------------------------------
// Internal HTML builders — each variant returns a ProseMirror renderHTML node
// spec (array tuples). We use inline styles only so the PDF html2canvas render
// captures them without a live stylesheet.
//
// Static style strings are module-level constants — they never change and
// hoisting avoids re-allocating arrays on every renderHTML call.
// ---------------------------------------------------------------------------

export type NodeSpec = [string, Record<string, string>, ...(string | NodeSpec)[]];

/** The words a cover holds, which can be typed on it. */
export type CoverTextField =
  | "title"
  | "subtitle"
  | "partNumber"
  | "blurb1"
  | "blurb2"
  | "blurb3"
  | "tagline"
  | "productUrl";

/**
 * What marks a word on the cover as typeable. Only the editor's drawing of the
 * cover asks for it; the printed markup never carries these.
 */
function field(editing: boolean, name: CoverTextField, placeholder: string): Record<string, string> {
  return editing ? { "data-field": name, "data-placeholder": placeholder } : {};
}

function bgStyle(url: string): string {
  if (!url) return "";
  return `background-image:url('${url}');background-size:cover;background-position:center;`;
}

/**
 * One cover's markup. `editing` is the editor drawing the very same cover with
 * its words marked as fields; false (print) leaves the markup as it always was.
 */
export function buildCoverInner(variant: CoverPageVariant, attrs: CoverPageAttrs, editing = false): NodeSpec[] {
  switch (variant) {
    case "front":  return buildFront(attrs, editing);
    case "inside": return buildInside(attrs, editing);
    case "part":   return buildPart(attrs, editing);
    case "back":   return buildBack(attrs, editing);
  }
}

// ── Front cover ──────────────────────────────────────────────────────────────

const FRONT_ART_IMG_STYLE =
  "position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:0";

const FRONT_ART_DIV_STYLE =
  "position:absolute;inset:0;width:100%;height:100%;z-index:0;" +
  "background:var(--sc-accent,#1B3A4B);opacity:0.18";

// The art is shown at full strength; only the shade under the title darkens
// (or lightens) it for legibility, and only where the title sits.
function shadeStyle(shade: Exclude<CoverShade, "none">, place: CoverTitlePlace): string {
  // Dusk is near-black; parchment is the page's own paper.
  const tone = (alpha: number) =>
    shade === "dusk"
      ? `rgba(0,0,0,${alpha})`
      : `color-mix(in srgb,var(--sc-page-bg,#F9F6EF) ${Math.round(alpha * 135)}%,transparent)`;
  const clear = shade === "dusk" ? "rgba(0,0,0,0)" : "color-mix(in srgb,var(--sc-page-bg,#F9F6EF) 0%,transparent)";
  const ramp =
    place === "middle"
      ? `to bottom,${clear} 15%,${tone(0.55)} 38%,${tone(0.55)} 62%,${clear} 85%`
      : `${place === "top" ? "to bottom" : "to top"},${tone(0.68)} 0%,${tone(0.3)} 28%,${clear} 55%`;
  return `position:absolute;inset:0;z-index:0;pointer-events:none;background:linear-gradient(${ramp})`;
}

// Full-bleed painted art, a shade, and the title stack set where the DM put it
// (the foot of the sheet by default) — no filled title plate (#915 story 6: a
// plate painted behind an <h1> collided with the book's own chapter-heading
// background, and read as either an overflowing or an invisible title
// depending on theme). Every colour/typography knob here is a CSS custom
// property so the looks read distinctly (tall condensed caps for onednd2024,
// serif small-caps for phb2014 — see --sc-cover-title-transform/
// --sc-cover-title-variant in the theme files) without this module knowing
// which look is active.
const FRONT_JUSTIFY: Record<CoverTitlePlace, string> = { top: "flex-start", middle: "center", bottom: "flex-end" };

function frontOverlayStyle(place: CoverTitlePlace): string {
  return (
    "position:absolute;inset:0;display:flex;flex-direction:column;" +
    `justify-content:${FRONT_JUSTIFY[place]};z-index:1;` +
    // The series line hangs from the top edge, so a title set at the top clears it.
    `padding:${place === "top" ? "4rem" : "2.5rem"} 2.5rem 2.5rem;text-align:center`
  );
}

// The series line at the very top of the sheet (attrs.tagline).
const FRONT_TAGLINE_STYLE =
  "position:absolute;top:2.25rem;left:2.5rem;right:2.5rem;z-index:1;text-align:center;" +
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:0.75rem;font-weight:700;" +
  "color:var(--sc-accent-contrast,#F9F6EF);text-shadow:0 1px 4px rgba(0,0,0,0.8);" +
  "letter-spacing:0.25em;text-transform:uppercase;margin:0;opacity:0.85";

// Light type over the art, or ink when the shade under it is paper.
function frontInk(onPaper: boolean, shadow: string): string {
  return onPaper ? "color:var(--sc-ink,#1a1a1a);" : `color:var(--sc-accent-contrast,#F9F6EF);text-shadow:${shadow};`;
}

// The small uppercase brand/edition line directly above the title (attrs.subtitle).
function frontSubtitleStyle(onPaper: boolean): string {
  return (
    "font-family:var(--sc-heading-font,Georgia,serif);font-size:0.95rem;font-weight:700;" +
    frontInk(onPaper, "0 1px 4px rgba(0,0,0,0.8)") +
    "letter-spacing:0.18em;text-transform:uppercase;margin:0 0 0.4rem;opacity:0.92;text-wrap:balance"
  );
}

// The title itself: very large, tall, condensed-reading caps, one or two lines.
function frontTitleStyle(onPaper: boolean): string {
  return (
    "font-family:var(--sc-heading-font,Georgia,serif);font-size:3.75rem;font-weight:700;" +
    frontInk(onPaper, "0 3px 16px rgba(0,0,0,0.85)") +
    "line-height:0.95;letter-spacing:0.01em;margin:0;" +
    "text-transform:var(--sc-cover-title-transform,uppercase);" +
    "font-variant:var(--sc-cover-title-variant,normal)"
  );
}

const FRONT_BODY_STYLE = "display:flex;flex-direction:column";

export function buildFront(attrs: CoverPageAttrs, editing = false): NodeSpec[] {
  // `sc-cover-art` (#915 story 6 round 2) opts this image out of the paged
  // stylesheet's generic `img { max-height; object-fit: contain }` rule
  // (pagedPreviewCss.ts) — that rule exists to stop an oversized inline image
  // from overflowing its page, but it also silently capped a full-bleed cover
  // photo at ~72% of the sheet, object-fit:contain shrinking it to fit and
  // leaving the bottom of the page showing whatever was underneath instead of
  // more art.
  const coverBg: NodeSpec = attrs.backgroundImage
    ? ["img", { src: attrs.backgroundImage, class: "sc-cover-art", style: FRONT_ART_IMG_STYLE, alt: "" }]
    : ["div", { style: FRONT_ART_DIV_STYLE }];
  const shade = coverShade(attrs);
  const place = COVER_TITLE_PLACES.includes(attrs.titlePlace) ? attrs.titlePlace : "bottom";
  // The shade only means something over art, and only when the DM has not put it away.
  const shaded = Boolean(attrs.backgroundImage) && shade !== "none";
  const onPaper = shaded && shade === "parchment";

  return [
    coverBg,
    ...(shaded ? [["div", { style: shadeStyle(shade, place) }] as NodeSpec] : []),
    // An empty series line prints nothing, but the editor keeps it to be typed into.
    ...(attrs.tagline || editing
      ? [["p", { style: FRONT_TAGLINE_STYLE, ...field(editing, "tagline", "Series line") }, attrs.tagline] as NodeSpec]
      : []),
    [
      "div",
      { style: frontOverlayStyle(place) },
      [
        "div",
        { style: FRONT_BODY_STYLE },
        ["p", { style: frontSubtitleStyle(onPaper), ...field(editing, "subtitle", "Subtitle") }, attrs.subtitle],
        ["h1", { style: frontTitleStyle(onPaper), ...field(editing, "title", "Title") }, attrs.title],
      ],
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
  "color:var(--sc-accent,#1B3A4B);line-height:1.05;margin:0 0 0.5rem;letter-spacing:0.01em;" +
  "text-transform:var(--sc-cover-title-transform,uppercase);" +
  "font-variant:var(--sc-cover-title-variant,normal)";

const INSIDE_SUBTITLE_STYLE =
  "font-family:var(--sc-body-font,Georgia,serif);font-size:1rem;" +
  "color:var(--sc-ink,#1a1a1a);font-style:italic;margin:0;opacity:0.8;text-wrap:balance";

function buildInside(attrs: CoverPageAttrs, editing: boolean): NodeSpec[] {
  // When there's a background image use an <img> for proper CORS/html2canvas
  // handling; otherwise fall back to a CSS background-image on a <div>.
  const artEl: NodeSpec = attrs.backgroundImage
    ? ["img", { src: attrs.backgroundImage, class: "sc-cover-art", style: INSIDE_ART_IMG_STYLE, alt: "" }]
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
      ["h1", { style: INSIDE_TITLE_STYLE, ...field(editing, "title", "Title") }, attrs.title],
      ["p", { style: INSIDE_SUBTITLE_STYLE, ...field(editing, "subtitle", "Subtitle") }, attrs.subtitle],
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
  "color:var(--sc-ink,#1a1a1a);font-style:italic;text-align:center;margin:0;opacity:0.75;max-width:22rem;text-wrap:balance";

function buildPart(attrs: CoverPageAttrs, editing: boolean): NodeSpec[] {
  return [
    [
      "div",
      { style: PART_CONTAINER_STYLE },
      ["hr", { style: PART_RULE_DOUBLE_STYLE }],
      ["p", { style: PART_LABEL_STYLE }, "Part"],
      ["p", { style: PART_NUMBER_STYLE, ...field(editing, "partNumber", "I") }, attrs.partNumber],
      ["hr", { style: PART_RULE_STYLE }],
      ["p", { style: PART_SUBTITLE_STYLE, ...field(editing, "subtitle", "Subtitle") }, attrs.subtitle],
    ],
  ];
}

// ── Back cover ───────────────────────────────────────────────────────────────

const BACK_CONTENT_STYLE =
  "position:absolute;top:35%;bottom:0;left:0;right:0;z-index:1;" +
  "padding:2rem 2.5rem;display:flex;flex-direction:column;justify-content:space-between";

const BACK_SUBTITLE_STYLE =
  "font-family:var(--sc-heading-font,Georgia,serif);font-size:1.35rem;font-weight:700;" +
  "color:var(--sc-accent,#1B3A4B);margin:0 0 1rem;letter-spacing:0.03em;text-wrap:balance";

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

export function buildBack(attrs: CoverPageAttrs, editing = false): NodeSpec[] {
  // Art (when set) shows at full strength — no text sits over the strip, so it
  // needs no scrim. The soft tint is kept only for the accent-colour placeholder
  // shown when there's no art.
  const artStripStyle =
    "width:100%;height:35%;position:absolute;top:0;left:0;right:0;z-index:0;" +
    `background:var(--sc-accent,#1B3A4B);${bgStyle(attrs.backgroundImage)}` +
    "background-size:cover;background-position:center" +
    (attrs.backgroundImage ? "" : ";opacity:0.75");

  return [
    ["div", { style: artStripStyle }],
    [
      "div",
      { style: BACK_CONTENT_STYLE },
      [
        "div",
        { style: "flex:1" },
        ["p", { style: BACK_SUBTITLE_STYLE, ...field(editing, "subtitle", "Subtitle") }, attrs.subtitle],
        ["p", { style: BACK_BLURB_STYLE, ...field(editing, "blurb1", "Opening hook") }, attrs.blurb1],
        ["p", { style: BACK_BLURB_STYLE, ...field(editing, "blurb2", "Stakes and world") }, attrs.blurb2],
        ["p", { style: BACK_BLURB_STYLE, ...field(editing, "blurb3", "Closing line") }, attrs.blurb3],
        ["p", { style: BACK_TAGLINE_STYLE, ...field(editing, "tagline", "Tagline") }, attrs.tagline],
      ],
      [
        "div",
        { style: BACK_BOTTOM_BAR_STYLE },
        // No invented fallback text (#915 story 6 round 2) — an empty
        // tagline renders as an empty span, not "An Unofficial Supplement".
        ["span", { ...field(editing, "tagline", "Tagline") }, attrs.tagline],
        ["span", { ...field(editing, "productUrl", "Product URL") }, attrs.productUrl],
      ],
    ],
  ];
}

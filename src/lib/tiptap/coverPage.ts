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

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    coverPage: {
      /** Insert a cover page of the given variant at the current cursor. */
      insertCoverPage: (attrs: { variant: CoverPageVariant } & Partial<Omit<CoverPageAttrs, "variant">>) => ReturnType;
    };
  }
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
 *   front   — title bar + art slot (full bleed) + subtitle + "HOMEBREW" banner + footnote
 *   inside  — art slot (upper half) + title + subtitle overlay at bottom
 *   part    — centred "PART N" + subtitle divider with ornamental rules
 *   back    — art strip + subtitle + three blurb paragraphs + tagline + URL
 *
 * A cover page must occupy its own physical page.  The node's renderHTML
 * emits a `data-cover-page-break="before"` attribute that the page-splitter in
 * ScriptoriumEditor uses to split at <hr> boundaries — we emit a leading <hr>
 * and a trailing <hr> in the inline HTML so the preview paginator treats the
 * cover as its own page.  The PDF renderer additionally applies
 * `break-before: page` / `break-after: page` via RENDER_CSS rules.
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

  addCommands() {
    return {
      insertCoverPage:
        (attrs) =>
        ({ commands }) => {
          // The cover page is emitted as its own page in the preview by wrapping
          // it with <hr> separators (the ScriptoriumEditor splits on <hr>).
          // We insert: [hr][coverPage node][hr] so the splitter isolates it.
          return commands.insertContent([
            { type: "horizontalRule" },
            { type: "coverPage", attrs },
            { type: "horizontalRule" },
          ]);
        },
    };
  },
});

// ---------------------------------------------------------------------------
// Internal HTML builders — each variant returns a Prosemirror renderHTML node
// spec (array tuples).  We use inline style only so the PDF html2canvas render
// picks up everything even without a live stylesheet.
// ---------------------------------------------------------------------------

type NodeSpec = [string, Record<string, string>, ...(string | NodeSpec)[]];

function bgStyle(url: string): string {
  if (!url) return "";
  return `background-image:url('${url}');background-size:cover;background-position:center;`;
}

function buildCoverInner(variant: CoverPageVariant, attrs: CoverPageAttrs): NodeSpec[] {
  switch (variant) {
    case "front":
      return buildFront(attrs);
    case "inside":
      return buildInside(attrs);
    case "part":
      return buildPart(attrs);
    case "back":
      return buildBack(attrs);
  }
}

function buildFront(attrs: CoverPageAttrs): NodeSpec[] {
  const hasBg = !!attrs.backgroundImage;
  const artStyle = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:100%",
    "object-fit:cover",
    "z-index:0",
    "opacity:0.55",
  ].join(";");

  const overlayStyle = [
    "position:absolute",
    "inset:0",
    "display:flex",
    "flex-direction:column",
    "justify-content:space-between",
    "z-index:1",
    "padding:2.5rem",
  ].join(";");

  const topBarStyle = [
    "background:var(--sc-title-bar-bg,var(--sc-accent,#1B3A4B))",
    "color:var(--sc-title-bar-color,var(--sc-accent-contrast,#F9F6EF))",
    "padding:0.75rem 1.25rem",
    "margin:-2.5rem -2.5rem 0",
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:0.65rem",
    "font-weight:700",
    "letter-spacing:0.18em",
    "text-transform:uppercase",
    "text-align:right",
  ].join(";");

  const titleStyle = [
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:3.5rem",
    "font-weight:700",
    "color:var(--sc-accent-contrast,#F9F6EF)",
    "text-shadow:0 2px 8px rgba(0,0,0,0.8)",
    "line-height:1.1",
    "letter-spacing:0.04em",
    "margin:0",
  ].join(";");

  const subtitleStyle = [
    "font-family:var(--sc-body-font,Georgia,serif)",
    "font-size:1.15rem",
    "color:var(--sc-accent-contrast,#F9F6EF)",
    "text-shadow:0 1px 4px rgba(0,0,0,0.8)",
    "font-style:italic",
    "margin:0.5rem 0 0",
    "opacity:0.9",
  ].join(";");

  const bottomBarStyle = [
    "background:var(--sc-accent,#1B3A4B)",
    "color:var(--sc-accent-contrast,#F9F6EF)",
    "padding:0.6rem 1.25rem",
    "margin:0 -2.5rem -2.5rem",
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:0.65rem",
    "letter-spacing:0.12em",
    "text-transform:uppercase",
    "text-align:center",
    "opacity:0.85",
  ].join(";");

  const coverBg: NodeSpec = hasBg
    ? ["img", { src: attrs.backgroundImage, style: artStyle, alt: "" }]
    : ["div", { style: `${artStyle};background:var(--sc-accent,#1B3A4B);opacity:0.18;` }];

  return [
    coverBg,
    [
      "div",
      { style: overlayStyle },
      ["div", { style: topBarStyle }, "HOMEBREW"],
      [
        "div",
        { style: "flex:1;display:flex;flex-direction:column;justify-content:flex-end;padding-bottom:1.5rem;" },
        ["h1", { style: titleStyle }, attrs.title],
        ["p", { style: subtitleStyle }, attrs.subtitle],
      ],
      ["div", { style: bottomBarStyle }, attrs.subtitle || "An Unofficial Supplement"],
    ],
  ];
}

function buildInside(attrs: CoverPageAttrs): NodeSpec[] {
  const hasBg = !!attrs.backgroundImage;

  const artStyle = [
    "position:absolute",
    "inset:0",
    "width:100%",
    "height:60%",
    "object-fit:cover",
    "z-index:0",
  ].join(";");

  const artDivStyle = [
    "position:absolute",
    "top:0",
    "left:0",
    "right:0",
    "height:60%",
    "z-index:0",
    `background:var(--sc-accent,#1B3A4B);${bgStyle(attrs.backgroundImage)}`,
    "background-size:cover",
    "background-position:center",
  ].join(";");

  const fadeStyle = [
    "position:absolute",
    "bottom:0",
    "left:0",
    "right:0",
    "height:40%",
    "background:linear-gradient(to bottom,transparent,var(--sc-page-bg,#F9F6EF))",
    "z-index:1",
  ].join(";");

  const textAreaStyle = [
    "position:absolute",
    "bottom:0",
    "left:0",
    "right:0",
    "z-index:2",
    "padding:2rem 2.5rem 3rem",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "text-align:center",
  ].join(";");

  const titleStyle = [
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:2.5rem",
    "font-weight:700",
    "color:var(--sc-accent,#1B3A4B)",
    "line-height:1.15",
    "margin:0 0 0.5rem",
    "letter-spacing:0.03em",
  ].join(";");

  const subtitleStyle = [
    "font-family:var(--sc-body-font,Georgia,serif)",
    "font-size:1rem",
    "color:var(--sc-ink,#1a1a1a)",
    "font-style:italic",
    "margin:0",
    "opacity:0.8",
  ].join(";");

  const artEl: NodeSpec = hasBg
    ? ["img", { src: attrs.backgroundImage, style: artStyle, alt: "" }]
    : ["div", { style: artDivStyle }];

  return [
    artEl,
    ["div", { style: fadeStyle }],
    [
      "div",
      { style: textAreaStyle },
      ["h1", { style: titleStyle }, attrs.title],
      ["p", { style: subtitleStyle }, attrs.subtitle],
    ],
  ];
}

function buildPart(attrs: CoverPageAttrs): NodeSpec[] {
  const containerStyle = [
    "position:absolute",
    "inset:0",
    "display:flex",
    "flex-direction:column",
    "align-items:center",
    "justify-content:center",
    "padding:3rem 2.5rem",
  ].join(";");

  const ruleStyle = [
    "border:none",
    "border-top:2px solid var(--sc-accent,#1B3A4B)",
    "width:60%",
    "margin:1.25rem 0",
    "opacity:0.4",
  ].join(";");

  const ruleDoubleBefore = [
    "border:none",
    "border-top:3px double var(--sc-accent,#1B3A4B)",
    "width:80%",
    "margin:0 0 1.5rem",
    "opacity:0.3",
  ].join(";");

  const partLabelStyle = [
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:0.7rem",
    "font-weight:700",
    "letter-spacing:0.28em",
    "text-transform:uppercase",
    "color:var(--sc-accent,#1B3A4B)",
    "opacity:0.65",
    "margin:0",
  ].join(";");

  const partNumberStyle = [
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:4.5rem",
    "font-weight:700",
    "color:var(--sc-accent,#1B3A4B)",
    "line-height:1",
    "margin:0.25rem 0 0",
    "letter-spacing:0.04em",
  ].join(";");

  const subtitleStyle = [
    "font-family:var(--sc-body-font,Georgia,serif)",
    "font-size:1.05rem",
    "color:var(--sc-ink,#1a1a1a)",
    "font-style:italic",
    "text-align:center",
    "margin:0",
    "opacity:0.75",
    "max-width:22rem",
  ].join(";");

  return [
    [
      "div",
      { style: containerStyle },
      ["hr", { style: ruleDoubleBefore }],
      ["p", { style: partLabelStyle }, "Part"],
      ["p", { style: partNumberStyle }, attrs.partNumber],
      ["hr", { style: ruleStyle }],
      ["p", { style: subtitleStyle }, attrs.subtitle],
    ],
  ];
}

function buildBack(attrs: CoverPageAttrs): NodeSpec[] {
  const hasBg = !!attrs.backgroundImage;

  const artStripStyle = [
    "width:100%",
    "height:35%",
    "position:absolute",
    "top:0",
    "left:0",
    "right:0",
    "z-index:0",
    `background:var(--sc-accent,#1B3A4B);${hasBg ? bgStyle(attrs.backgroundImage) : ""}`,
    "background-size:cover",
    "background-position:center",
    "opacity:0.75",
  ].join(";");

  const contentStyle = [
    "position:absolute",
    "top:35%",
    "bottom:0",
    "left:0",
    "right:0",
    "z-index:1",
    "padding:2rem 2.5rem",
    "display:flex",
    "flex-direction:column",
    "justify-content:space-between",
  ].join(";");

  const subtitleStyle = [
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:1.35rem",
    "font-weight:700",
    "color:var(--sc-accent,#1B3A4B)",
    "margin:0 0 1rem",
    "letter-spacing:0.03em",
  ].join(";");

  const blurbStyle = [
    "font-family:var(--sc-body-font,Georgia,serif)",
    "font-size:0.875rem",
    "color:var(--sc-ink,#1a1a1a)",
    "line-height:1.6",
    "margin:0 0 0.75rem",
  ].join(";");

  const taglineStyle = [
    "font-family:var(--sc-body-font,Georgia,serif)",
    "font-size:0.8rem",
    "color:var(--sc-accent,#1B3A4B)",
    "font-style:italic",
    "margin:0.5rem 0 0",
    "opacity:0.8",
  ].join(";");

  const bottomBarStyle = [
    "background:var(--sc-accent,#1B3A4B)",
    "color:var(--sc-accent-contrast,#F9F6EF)",
    "padding:0.5rem 1rem",
    "font-family:var(--sc-heading-font,Georgia,serif)",
    "font-size:0.6rem",
    "letter-spacing:0.1em",
    "text-transform:uppercase",
    "display:flex",
    "align-items:center",
    "justify-content:space-between",
  ].join(";");

  return [
    ["div", { style: artStripStyle }],
    [
      "div",
      { style: contentStyle },
      [
        "div",
        { style: "flex:1;" },
        ["p", { style: subtitleStyle }, attrs.subtitle],
        ["p", { style: blurbStyle }, attrs.blurb1],
        ["p", { style: blurbStyle }, attrs.blurb2],
        ["p", { style: blurbStyle }, attrs.blurb3],
        ["p", { style: taglineStyle }, attrs.tagline],
      ],
      [
        "div",
        { style: bottomBarStyle },
        ["span", {}, "HOMEBREW SUPPLEMENT"],
        ["span", {}, attrs.productUrl],
      ],
    ],
  ];
}

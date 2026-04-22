/**
 * Cover page Tiptap-JSON factories.
 *
 * Each function returns an insertContent-compatible JSON snippet for a
 * specific cover variant, wrapped between two `horizontalRule` nodes so
 * the ScriptoriumEditor page-splitter isolates the cover onto its own page.
 *
 * Callers (blockRegistry action) can pass partial overrides to pre-fill
 * fields; anything omitted falls back to the placeholder text baked into
 * the CoverPage node's attribute defaults.
 */

import type { CoverPageVariant, CoverPageAttrs } from "@/lib/tiptap/coverPage";

type CoverContent = {
  type: "horizontalRule" | "coverPage";
  attrs?: Partial<CoverPageAttrs & { variant: CoverPageVariant }>;
};

export type CoverPageJSON = {
  type: "horizontalRule" | "coverPage";
  attrs?: Partial<CoverPageAttrs & { variant: CoverPageVariant }>;
}[];

function makeCover(
  variant: CoverPageVariant,
  overrides: Partial<Omit<CoverPageAttrs, "variant">> = {},
): CoverPageJSON {
  const node: CoverContent = {
    type: "coverPage",
    attrs: { variant, ...overrides },
  };
  return [{ type: "horizontalRule" }, node, { type: "horizontalRule" }];
}

/** Front cover — title, subtitle, art slot, HOMEBREW banner + footnote. */
export function frontCoverTemplate(
  overrides: Partial<Omit<CoverPageAttrs, "variant">> = {},
): CoverPageJSON {
  return makeCover("front", {
    title: "Document Title",
    subtitle: "An Unofficial Homebrew Supplement",
    backgroundImage: "",
    ...overrides,
  });
}

/** Inside cover — background art (upper half) with title + subtitle overlay at bottom. */
export function insideCoverTemplate(
  overrides: Partial<Omit<CoverPageAttrs, "variant">> = {},
): CoverPageJSON {
  return makeCover("inside", {
    title: "Document Title",
    subtitle: "An Unofficial Homebrew Supplement",
    backgroundImage: "",
    ...overrides,
  });
}

/** Part divider — "PART N" + subtitle for separating major sections of a long brew. */
export function partDividerTemplate(
  overrides: Partial<Omit<CoverPageAttrs, "variant">> = {},
): CoverPageJSON {
  return makeCover("part", {
    partNumber: "I",
    subtitle: "Chapter Title or Section Name",
    ...overrides,
  });
}

/** Back cover — art strip, subtitle, three blurb paragraphs, tagline, URL. */
export function backCoverTemplate(
  overrides: Partial<Omit<CoverPageAttrs, "variant">> = {},
): CoverPageJSON {
  return makeCover("back", {
    subtitle: "Document Title",
    blurb1:
      "Your adventure begins here. Replace this blurb with a compelling hook that draws readers in and sets the tone for what lies within.",
    blurb2:
      "Describe the stakes, the world, or the central conflict. Paint a vivid picture of the challenges players will face.",
    blurb3:
      "A final line to close the back-cover pitch. Keep it short, evocative, and punchy.",
    tagline: "An unofficial Grimoire supplement for Fifth Edition",
    productUrl: "grimoire.example.com",
    backgroundImage: "",
    ...overrides,
  });
}

import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";

import CoverPageView from "@/scriptorium/components/CoverPageView.vue";
import type { CoverPageVariant } from "@/lib/tiptap/nodeViewTypes";
import {
  COVER_SHADES,
  COVER_TITLE_STYLES,
  coverClass,
  COVER_TITLE_PLACES,
  buildCoverInner,
  type CoverPageAttrs,
  type CoverShade,
  type CoverTitleStyle,
  type CoverTitlePlace,
} from "@/scriptorium/lib/coverMarkup";
export * from "@/scriptorium/lib/coverMarkup";

function strAttr(key: string, fallback: string) {
  return {
    default: fallback,
    parseHTML: (el: HTMLElement) => el.getAttribute(`data-${key}`) ?? fallback,
    renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${key}`]: attrs[key] }),
  };
}

function choiceAttr<T extends string>(key: string, choices: readonly T[], fallback: T) {
  return {
    default: fallback,
    parseHTML: (el: HTMLElement) => {
      const v = el.getAttribute(`data-${key}`);
      return (choices as readonly string[]).includes(v ?? "") ? (v as T) : fallback;
    },
    renderHTML: (attrs: Record<string, unknown>) => ({ [`data-${key}`]: attrs[key] }),
  };
}

/**
 * CoverPage — full-page cover node with four visual variants.
 *
 * Variant rendering strategy:
 *   front   — full-bleed art slot + title + subtitle + footer banner
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
      // No invented default text (#915 story 6 round 2) — an empty tagline
      // renders nothing (see buildFront/buildBack below), rather than every
      // cover that hasn't set one silently printing the same boilerplate
      // line. The templates below still seed an editable placeholder for a
      // NEW back cover, same as "Document Title" does for the title field;
      // that's authored content the DM is expected to change, not a
      // render-time fallback.
      tagline: strAttr("tagline", ""),
      productUrl: strAttr("productUrl", "grimoire.example.com"),
      backgroundImage: strAttr("backgroundImage", ""),
      titlePlace: choiceAttr<CoverTitlePlace>("titlePlace", COVER_TITLE_PLACES, "bottom"),
      shade: choiceAttr<CoverShade>("shade", COVER_SHADES, "dusk"),
      titleStyle: choiceAttr<CoverTitleStyle>("titleStyle", COVER_TITLE_STYLES, "look"),
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="coverPage"]' }];
  },

  addNodeView() {
    // The cover is drawn as it prints, with its words typed on it (#1176).
    return VueNodeViewRenderer(CoverPageView);
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
          class: coverClass(variant, attrs),
        },
        HTMLAttributes,
      ),
      ...inner,
    ];
  },
});


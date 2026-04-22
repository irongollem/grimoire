import { Node, mergeAttributes } from "@tiptap/core";

export type ArtistCreditPosition =
  | "top-right"
  | "top-left"
  | "bottom-right"
  | "bottom-left";

export interface ArtistCreditAttrs {
  /** The artist's name. Renders as "Art by {artistName}". */
  artistName: string;
  /** Which corner of the page to anchor the credit to. */
  position: ArtistCreditPosition;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    artistCredit: {
      insertArtistCredit: (attrs?: Partial<ArtistCreditAttrs>) => ReturnType;
    };
  }
}

/**
 * Artist credit overlay — a tiny italic line tucked into a page corner.
 *
 * Renders "Art by {artistName}" absolutely positioned at the chosen corner
 * of the enclosing `.phb-page`. Uses `--sc-decoration-credit` (falling back
 * to `--sc-ink` at reduced opacity) so both themes are handled without hex.
 *
 * Survives page-break and PDF export: since each page element is independent
 * in the PDF render, the credit is stamped per page it appears on.
 */
export const ArtistCredit = Node.create({
  name: "artistCredit",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      artistName: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-artist-name") ?? "",
        renderHTML: (attrs) => ({ "data-artist-name": attrs.artistName }),
      },
      position: {
        default: "bottom-right" as ArtistCreditPosition,
        parseHTML: (el) =>
          (el.getAttribute("data-position") as ArtistCreditPosition) ??
          "bottom-right",
        renderHTML: (attrs) => ({ "data-position": attrs.position }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="artistCredit"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as ArtistCreditAttrs;
    const pos = attrs.position ?? "bottom-right";
    const posStyles = positionStyles(pos);

    const style = [
      "position:absolute",
      ...posStyles,
      "font-family:var(--sc-body-font,Georgia,serif)",
      "font-size:0.6rem",
      "font-style:italic",
      "color:var(--sc-decoration-credit,var(--sc-ink,#1a1a1a))",
      "opacity:0.55",
      "pointer-events:none",
      "white-space:nowrap",
      "z-index:1",
      "user-select:none",
    ].join(";");

    const label = attrs.artistName
      ? `Art by ${attrs.artistName}`
      : "Art by [artist]";

    return [
      "div",
      mergeAttributes({ "data-type": "artistCredit", style }, HTMLAttributes),
      label,
    ];
  },

  addCommands() {
    return {
      insertArtistCredit:
        (attrs?: Partial<ArtistCreditAttrs>) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "artistCredit",
            attrs: attrs ?? {},
          });
        },
    };
  },
});

function positionStyles(position: ArtistCreditPosition): string[] {
  switch (position) {
    case "top-left":
      return ["top:0.75rem", "left:1rem"];
    case "top-right":
      return ["top:0.75rem", "right:1rem"];
    case "bottom-left":
      return ["bottom:0.75rem", "left:1rem"];
    case "bottom-right":
    default:
      return ["bottom:0.75rem", "right:1rem"];
  }
}

import { Node, mergeAttributes } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import EntityEmbedView from "@/components/scriptorium/EntityEmbedView.vue";

/*
 * EntityEmbed — a Scriptorium block that holds a live reference to a game
 * entity (an NPC, monster, spell, item, location or quest) rather than a
 * one-time HTML snapshot (#915 story 3).
 *
 * "Insert Asset" used to paste `format*ForScriptorium(...).content` straight
 * into the document, so editing the NPC afterwards never touched the book.
 * This node stores only `entityType` + `entityId`; the galley, the paginated
 * preview and the PDF export all resolve it against CURRENT data through
 * `useEntityEmbedData` / `resolveEntityEmbeds` (src/lib/scriptorium/entityEmbeds.ts).
 *
 * `renderHTML` emits a placeholder div with no entity data inside it — just
 * the two data attributes a resolver needs to look the entity up. That keeps
 * a saved document small and keeps stale entity data from ever being
 * persisted into `scriptorium_documents.content`.
 *
 * The Vue node view (`EntityEmbedView.vue`) only takes over when the editor
 * is actually mounted through `<EditorContent>` — `VueNodeViewRenderer`
 * returns `{}` (falling back to plain `renderHTML`) when `editor.contentComponent`
 * is unset, which is exactly the case for a headless `Editor` built directly
 * from `@tiptap/core` in a test. That's what keeps a round-trip test cheap:
 * it never has to mount a live Vue app with a query client and a router.
 */

export type EntityEmbedType = "npc" | "monster" | "spell" | "item" | "location" | "quest";

export const ENTITY_EMBED_TYPES: readonly EntityEmbedType[] = [
  "npc",
  "monster",
  "spell",
  "item",
  "location",
  "quest",
];

/**
 * Stat-block size (#915 story 6). "auto" is the default and picks itself from
 * the entity's own content (see autoStatBlockSize() in scriptoriumImport.ts) —
 * a short stat block reads as a "column" box in its own text column, a long
 * one as a "wide" block spanning both page columns with its own internal
 * two-column flow, matching how the printed books lay out a creature too
 * long for one column. The author can override either way.
 */
export type EntityEmbedSize = "auto" | "column" | "wide";

export interface EntityEmbedAttrs {
  entityType: EntityEmbedType;
  entityId: string;
  size?: EntityEmbedSize;
  /** Show the entity's portrait/art (monster/NPC entries only). Default true. */
  showArt?: boolean;
  /**
   * Force this entry onto a fresh page (#915 story 6) — the default for a
   * monster (a Monster Manual entry starts its own page), off by default for
   * every other embed type. Turn it off for a creature VARIANT that should
   * follow its family's first entry on the same page(s) (e.g. flying sword
   * and rug of smothering following animated armor under "Animated
   * Objects") — the DM switches it off per variant; nothing here detects a
   * family automatically. A normal document H2 placed directly before the
   * entry (a family heading) keeps the page break: it moves from the entry
   * to that heading (see the paged stylesheet).
   */
  startsPage?: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityEmbed: {
      /** Insert a live-linked entity block. */
      insertEntityEmbed: (attrs: EntityEmbedAttrs) => ReturnType;
    };
  }
}

export const EntityEmbed = Node.create({
  name: "entityEmbed",
  group: "block",
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      entityType: {
        default: "npc" as EntityEmbedType,
        parseHTML: (el: HTMLElement) =>
          (el.getAttribute("data-entity-type") as EntityEmbedType) ?? "npc",
        renderHTML: (attrs: { entityType: EntityEmbedType }) => ({
          "data-entity-type": attrs.entityType,
        }),
      },
      entityId: {
        default: "",
        parseHTML: (el: HTMLElement) => el.getAttribute("data-entity-id") ?? "",
        renderHTML: (attrs: { entityId: string }) => ({ "data-entity-id": attrs.entityId }),
      },
      size: {
        default: "auto" as EntityEmbedSize,
        parseHTML: (el: HTMLElement) =>
          (el.getAttribute("data-size") as EntityEmbedSize) ?? "auto",
        renderHTML: (attrs: { size?: EntityEmbedSize }) => ({
          "data-size": attrs.size ?? "auto",
        }),
      },
      showArt: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-show-art") !== "false",
        renderHTML: (attrs: { showArt?: boolean }) => ({
          "data-show-art": String(attrs.showArt ?? true),
        }),
      },
      startsPage: {
        default: true,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-starts-page") !== "false",
        renderHTML: (attrs: { startsPage?: boolean }) => ({
          "data-starts-page": String(attrs.startsPage ?? true),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="entity-embed"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const startsPage = (node.attrs as EntityEmbedAttrs).startsPage ?? true;
    const cls = ["sc-entity-embed", startsPage ? "sc-entity-embed--startpage" : ""]
      .filter(Boolean)
      .join(" ");
    return [
      "div",
      mergeAttributes({ "data-type": "entity-embed", class: cls }, HTMLAttributes),
    ];
  },

  addCommands() {
    return {
      insertEntityEmbed:
        (attrs: EntityEmbedAttrs) =>
        ({ commands }) =>
          commands.insertContent({ type: "entityEmbed", attrs }),
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(EntityEmbedView);
  },
});

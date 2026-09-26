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

export interface EntityEmbedAttrs {
  entityType: EntityEmbedType;
  entityId: string;
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
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="entity-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes({ "data-type": "entity-embed", class: "sc-entity-embed" }, HTMLAttributes),
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

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";

export type EntityType = "player" | "npc" | "monster" | "location" | "party" | "faction";

/**
 * A suggestion-list item for the @mention picker UI only. `label` never
 * reaches storage — see `EntityMentionAttrs` below.
 */
export interface EntityMentionItem {
  id: string;
  entityType: EntityType;
  label: string;
}

/**
 * What a stored mention actually carries, and it is deliberately `label`-less
 * (#932 story 3): a note's rich-text JSON is downloaded verbatim by every
 * viewer, including the player portal, so storing the entity's real name here
 * leaked a disguised NPC's true identity straight past the server-side name
 * gate. The display name is resolved per-viewer at render time instead — see
 * `EntityMentionChip`, which calls `useMentionName(entityType, id)` itself
 * (not an extension option: that would make every editor/viewer instance —
 * `RichTextViewer` alone has 57 call sites — subscribe to every entity kind's
 * query whether or not the document mentions one; the chip is the one place
 * that actually knows which single lookup it needs).
 */
export interface EntityMentionAttrs {
  id: string;
  entityType: EntityType;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    entityMention: {
      insertEntityMention: (attrs: EntityMentionAttrs) => ReturnType;
    };
  }
}

export const EntityMentionPluginKey = new PluginKey("entityMention");

export function createEntityMentionExtension(
  suggestionOptions: Partial<SuggestionOptions<EntityMentionItem>>,
) {
  return Node.create({
    name: "entityMention",
    group: "inline",
    inline: true,
    atom: true,
    selectable: true,

    addAttributes() {
      return {
        id: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-entity-id"),
          renderHTML: (attrs) => ({ "data-entity-id": attrs.id }),
        },
        entityType: {
          default: null,
          parseHTML: (el) => el.getAttribute("data-entity-type"),
          renderHTML: (attrs) => ({ "data-entity-type": attrs.entityType }),
        },
      };
    },

    parseHTML() {
      return [{ tag: "span[data-entity-id]" }];
    },

    renderHTML({ HTMLAttributes }) {
      return [
        "span",
        mergeAttributes({ "data-type": "entityMention" }, HTMLAttributes),
      ];
    },

    addCommands() {
      return {
        insertEntityMention:
          (attrs: EntityMentionAttrs) =>
          ({ commands }: CommandProps) => {
            return commands.insertContent({ type: "entityMention", attrs });
          },
      };
    },

    addNodeView() {
      return VueNodeViewRenderer(EntityMentionChip);
    },

    addProseMirrorPlugins() {
      return [
        Suggestion({
          editor: this.editor,
          pluginKey: EntityMentionPluginKey,
          char: "@",
          ...suggestionOptions,
        }),
      ];
    },
  });
}

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import { Suggestion } from "@tiptap/suggestion";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";

export type EntityType = "player" | "npc" | "monster" | "location" | "party";

export interface EntityMentionItem {
  id: string;
  entityType: EntityType;
  label: string;
}

export interface EntityMentionAttrs {
  id: string;
  entityType: EntityType;
  label: string;
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
        label: {
          default: "",
          parseHTML: (el) => el.getAttribute("data-label"),
          renderHTML: (attrs) => ({ "data-label": attrs.label }),
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

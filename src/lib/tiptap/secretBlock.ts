import { Node, mergeAttributes } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    secretBlock: {
      /**
       * Wrap the selected blocks in a DM-only passage, or lift them out again
       * if the cursor is already inside one.
       */
      toggleSecretBlock: () => ReturnType;
    };
  }
}

/**
 * A passage the DM keeps back inside text that is otherwise shared (#932).
 *
 * The server strips this node, at any depth, from every player-visible
 * projection (`private.withhold_secret_blocks`, migration 20261007092700), so a
 * player's client never receives it. It is never hidden with CSS: a secret the
 * client never gets beats one it is asked not to show. The node name below is
 * part of that contract; renaming it silently leaks every stored secret.
 *
 * Registered in EVERY `RichTextEditor`, not only where the toolbar offers it
 * (`allowSecrets`). ProseMirror drops nodes its schema does not know when it
 * loads content, so a DM opening the same field in an editor without this node
 * would delete their secret on the next save. Only the toolbar control and the
 * shortcut are gated.
 *
 * The DM-facing marking (dashed frame and a label) is CSS in
 * `src/assets/secret-block.css`, keyed on `data-type`, shared by the editor and
 * `RichTextViewer`.
 */
export const SecretBlock = Node.create({
  name: "secretBlock",
  group: "block",
  content: "block+",
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="secretBlock"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "secretBlock" }, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      toggleSecretBlock:
        () =>
        ({ commands, state }) => {
          const { $from } = state.selection;
          for (let depth = $from.depth; depth > 0; depth--) {
            if ($from.node(depth).type === this.type) {
              return commands.lift(this.name);
            }
          }
          return commands.wrapIn(this.name);
        },
    };
  },

  addKeyboardShortcuts() {
    return {
      // Only where the toolbar offers secrets: elsewhere the node exists to
      // survive a load, not to be created.
      "Mod-Alt-s": () => (this.options.creatable ? this.editor.commands.toggleSecretBlock() : false),
    };
  },

  addOptions() {
    return { creatable: false };
  },
});

import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

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
 *
 * Each block carries a `secretId` (#1053): what an NPC memory names when it
 * discloses this passage. The editor mints it, so the open editor holds the id
 * it will save (every editor keeps its own document after saving and never
 * reloads the server's copy); the server stamps any straggler that arrives
 * without one (migration 20261012233859). Minting happens only in response to
 * an edit, never on load: a load-time mint would dirty every editor on open and
 * could give two devices different ids for the same block.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * A transaction giving a fresh id to every secret block whose id is missing,
 * malformed, or shared with an earlier block (paste/duplicate). The first
 * occurrence keeps its id. Null when nothing needs one.
 */
function assignSecretIds(state: { doc: ProseMirrorNode; tr: Transaction }): Transaction | null {
  const seen = new Set<string>();
  let tr = null as Transaction | null;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "secretBlock") return true;
    const id: unknown = node.attrs.secretId;
    if (typeof id !== "string" || !UUID.test(id) || seen.has(id)) {
      tr ??= state.tr;
      tr.setNodeAttribute(pos, "secretId", crypto.randomUUID());
    } else {
      seen.add(id);
    }
    return true;
  });
  // Not history: Undo must never strip the id off a block that still exists.
  return tr ? tr.setMeta("addToHistory", false) : null;
}

export const SecretBlock = Node.create({
  name: "secretBlock",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      secretId: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute("data-secret-id"),
        renderHTML: (attrs: { secretId?: string | null }) =>
          attrs.secretId ? { "data-secret-id": attrs.secretId } : {},
      },
    };
  },

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
          return commands.wrapIn(this.name, { secretId: crypto.randomUUID() });
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

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("secretBlockIds"),
        appendTransaction: (transactions, _oldState, newState) => {
          if (!transactions.some((tr) => tr.docChanged)) return null;
          return assignSecretIds(newState);
        },
      }),
    ];
  },

  addOptions() {
    return { creatable: false };
  },
});

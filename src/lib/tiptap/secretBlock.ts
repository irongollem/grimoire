import { Node, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { Transaction } from "@tiptap/pm/state";
import { Fragment, Slice, type Node as ProseMirrorNode } from "@tiptap/pm/model";

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
 * Marks a pasted block's id for the one `appendTransaction` that follows the
 * paste. It lives in the `secretId` attribute itself (not a second attribute,
 * which `getJSON()` would serialise) and is always resolved in the same
 * dispatch, so it never reaches `getJSON()` or a saved document.
 */
const PASTED = "pasted:";

/**
 * A transaction giving a fresh id to every secret block whose id is missing,
 * malformed, or duplicated. Null when nothing needs one.
 *
 * - A block marked as pasted keeps its id when no other block holds it (a
 *   cut-and-paste move), and gets a fresh one when the id still exists
 *   elsewhere (a copy), wherever the copy sits relative to the original.
 * - Unmarked duplicates (not from a paste) fall back to first occurrence
 *   keeping the id.
 */
function assignSecretIds(state: { doc: ProseMirrorNode; tr: Transaction }): Transaction | null {
  const held = new Set<string>();
  state.doc.descendants((node) => {
    const id: unknown = node.attrs.secretId;
    if (node.type.name === "secretBlock" && typeof id === "string" && UUID.test(id)) held.add(id);
    return true;
  });
  const seen = new Set<string>();
  let tr = null as Transaction | null;
  const set = (pos: number, id: string) => {
    tr ??= state.tr;
    tr.setNodeAttribute(pos, "secretId", id);
  };
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "secretBlock") return true;
    const raw: unknown = node.attrs.secretId;
    if (typeof raw === "string" && raw.startsWith(PASTED)) {
      const id = raw.slice(PASTED.length);
      if (UUID.test(id) && !held.has(id) && !seen.has(id)) {
        seen.add(id);
        set(pos, id);
      } else set(pos, crypto.randomUUID());
    } else if (typeof raw !== "string" || !UUID.test(raw) || seen.has(raw)) {
      set(pos, crypto.randomUUID());
    } else {
      seen.add(raw);
    }
    return true;
  });
  // Not history: Undo must never strip the id off a block that still exists.
  return tr ? (tr as Transaction).setMeta("addToHistory", false) : null;
}

/**
 * The same slice with every secret block's id marked as pasted, so
 * `assignSecretIds` can tell a move (the id is gone from the document) from a
 * copy (the original still holds it) without caring which comes first.
 */
function markPastedSecretIds(slice: Slice): Slice {
  const strip = (fragment: Fragment): Fragment => {
    const nodes: ProseMirrorNode[] = [];
    fragment.forEach((node) => {
      if (node.isText) {
        nodes.push(node);
        return;
      }
      const content = strip(node.content);
      nodes.push(
        node.type.name === "secretBlock"
          ? node.type.create({ ...node.attrs, secretId: typeof node.attrs.secretId === "string" ? PASTED + node.attrs.secretId : null }, content, node.marks)
          : node.copy(content),
      );
    });
    return Fragment.fromArray(nodes);
  };
  return new Slice(strip(slice.content), slice.openStart, slice.openEnd);
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
        props: { transformPasted: markPastedSecretIds },
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

import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import PendingImageCard from "@/components/tiptap/PendingImageCard.vue";

export type PendingImageStatus = "pending" | "failed";

export interface PendingImageAttrs {
  jobId: string;
  prompt: string;
  size: string;
  status?: PendingImageStatus;
  /** ms epoch the placeholder was inserted — drives the elapsed-time readout.
   * Set explicitly by the caller on insert; the schema default only covers
   * content parsed without it (shouldn't happen for freshly-created anchors). */
  startedAt?: number | null;
}

// Extend TipTap's Commands interface so editor.commands / chain() are fully typed.
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    pendingImage: {
      insertPendingImage: (attrs: PendingImageAttrs) => ReturnType;
    };
  }
}

export const PendingImage = Node.create({
  name: "pendingImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      jobId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-job-id"),
        renderHTML: (attrs) => ({ "data-job-id": attrs.jobId }),
      },
      prompt: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-prompt") ?? "",
        renderHTML: (attrs) => ({ "data-prompt": attrs.prompt }),
      },
      size: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-size") ?? "",
        renderHTML: (attrs) => ({ "data-size": attrs.size }),
      },
      status: {
        default: "pending",
        parseHTML: (el) => el.getAttribute("data-status") ?? "pending",
        renderHTML: (attrs) => ({ "data-status": attrs.status }),
      },
      startedAt: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-started-at");
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attrs) =>
          attrs.startedAt !== null && attrs.startedAt !== undefined
            ? { "data-started-at": String(attrs.startedAt) }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="pendingImage"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes({ "data-type": "pendingImage" }, HTMLAttributes)];
  },

  addCommands() {
    return {
      insertPendingImage:
        (attrs: PendingImageAttrs) =>
        ({ commands }: CommandProps) => {
          return commands.insertContent({
            type: "pendingImage",
            attrs: { status: "pending", startedAt: Date.now(), ...attrs },
          });
        },
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(PendingImageCard);
  },
});

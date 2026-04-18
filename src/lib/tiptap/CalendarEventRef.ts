import { Node, mergeAttributes } from "@tiptap/core";
import type { CommandProps } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";
import CalendarEventRefChip from "@/components/tiptap/CalendarEventRefChip.vue";

export interface CalendarEventRefAttrs {
  eventId: string;
  label: string;
  /** Harptos year — stored so the viewer can navigate without a DB lookup */
  year: number | null;
  /** Harptos month — stored for the same reason (null = festival day) */
  month: number | null;
}

// Extend TipTap's Commands interface so editor.commands / chain() are fully typed.
declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    calendarEventRef: {
      insertCalendarEventRef: (attrs: CalendarEventRefAttrs) => ReturnType;
    };
  }
}

export const CalendarEventRef = Node.create({
  name: "calendarEventRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      eventId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-event-id"),
        renderHTML: (attrs) => ({ "data-event-id": attrs.eventId }),
      },
      label: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-label"),
        renderHTML: (attrs) => ({ "data-label": attrs.label }),
      },
      year: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-year");
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attrs) =>
          attrs.year !== null ? { "data-year": String(attrs.year) } : {},
      },
      month: {
        default: null,
        parseHTML: (el) => {
          const v = el.getAttribute("data-month");
          return v ? parseInt(v, 10) : null;
        },
        renderHTML: (attrs) =>
          attrs.month !== null ? { "data-month": String(attrs.month) } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-event-id]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-type": "calendarEventRef" }, HTMLAttributes)];
  },

  addCommands() {
    return {
      insertCalendarEventRef:
        (attrs: CalendarEventRefAttrs) =>
        ({ commands }: CommandProps) => {
          return commands.insertContent({ type: "calendarEventRef", attrs });
        },
    };
  },

  addNodeView() {
    return VueNodeViewRenderer(CalendarEventRefChip);
  },
});

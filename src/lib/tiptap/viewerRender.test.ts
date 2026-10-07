// @vitest-environment happy-dom
/**
 * Parity between `viewerRender` (no Tiptap) and Tiptap itself, for every node
 * and mark the viewer's extension list can produce. Two oracles:
 *
 *  1. `generateHTML` over the viewer's extension list: the serialisation each
 *     extension declares in `renderHTML`.
 *  2. A real read-only `Editor` over the same list (minus the Vue node views,
 *     which need an app): the DOM the viewer actually showed before, including
 *     the trailing `<br>`s ProseMirror adds to empty textblocks and TaskItem's
 *     node-view markup.
 *
 * Production code may not import Tiptap; this file may, because its job is to
 * hold the two together. Node-view nodes (mention, calendar ref, illustration
 * suggestion, pending image) render Vue components, so they are stubbed here
 * to the extension's own `renderHTML` output and their props are asserted
 * separately — that is the documented exception to byte parity.
 */
import { describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { Editor, generateHTML, type Extensions, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Typography from "@tiptap/extension-typography";
import { Columns } from "./Columns";
import { AiGenerated } from "./AiGenerated";
import { SecretBlock } from "./secretBlock";
import { CalendarEventRef } from "./CalendarEventRef";
import { createEntityMentionExtension } from "./EntityMention";
import { IllustrationSuggestion } from "./IllustrationSuggestion";
import { PendingImage } from "./PendingImage";
import EntityMentionChip from "@/components/tiptap/EntityMentionChip.vue";
import CalendarEventRefChip from "@/components/tiptap/CalendarEventRefChip.vue";
import IllustrationSuggestionChip from "@/components/tiptap/IllustrationSuggestionChip.vue";
import PendingImageCard from "@/components/tiptap/PendingImageCard.vue";
import { parseStoredContent, renderStoredDoc } from "./viewerRender";

// Stand-ins for the chips: each emits what its extension's renderHTML emits.
vi.mock("@/components/tiptap/EntityMentionChip.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["entityType", "id", "editable"],
      setup: (p) => () =>
        h("span", { "data-type": "entityMention", "data-entity-id": p.id, "data-entity-type": p.entityType }),
    }),
  };
});
vi.mock("@/components/tiptap/CalendarEventRefChip.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["eventId", "label", "editable"],
      setup: (p) => () =>
        h("span", { "data-type": "calendarEventRef", "data-event-id": p.eventId, "data-label": p.label }),
    }),
  };
});
vi.mock("@/components/tiptap/IllustrationSuggestionChip.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["prompt", "editable"],
      setup: (p) => () => h("div", { "data-illustration-suggestion": "", "data-prompt": p.prompt }),
    }),
  };
});
vi.mock("@/components/tiptap/PendingImageCard.vue", async () => {
  const { defineComponent, h } = await import("vue");
  return {
    default: defineComponent({
      props: ["status", "prompt", "startedAt", "editable"],
      setup: (p) => () => h("div", { "data-type": "pendingImage", "data-status": p.status, "data-prompt": p.prompt }),
    }),
  };
});
// Not exercised by the stubs above, but the extensions import their node views.
vi.mock("@/components/tiptap/EntityMentionNodeView.vue", () => ({ default: {} }));
vi.mock("@/components/tiptap/CalendarEventRefNodeView.vue", () => ({ default: {} }));
vi.mock("@/components/tiptap/IllustrationSuggestionNodeView.vue", () => ({ default: {} }));
vi.mock("@/components/tiptap/PendingImageNodeView.vue", () => ({ default: {} }));

// The viewer's extension list as RichTextViewer used to build it.
function viewerExtensions(): Extensions {
  return [
    StarterKit.configure({
      link: { openOnClick: true, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
    }),
    Table,
    TableRow,
    TableHeader,
    TableCell,
    Image,
    TextAlign.configure({ types: ["heading", "paragraph"] }),
    Columns,
    Highlight,
    TaskList,
    TaskItem.configure({ nested: true }),
    Typography,
    CalendarEventRef,
    createEntityMentionExtension({}),
    IllustrationSuggestion,
    PendingImage,
    AiGenerated,
    SecretBlock,
  ];
}

// ── Normalisation: only what is irrelevant to how the page looks ────────────

function normaliseStyle(value: string): string {
  return value
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean)
    .join("; ");
}

// Attributes the extensions render that a chip has no use for, so the chips
// are never handed them (a calendar ref's year, a pending image's job id).
const CHIP_ONLY_ATTRS = ["data-year", "data-month", "data-job-id", "data-size", "data-started-at"];

function canonical(node: Node, opts: { trailingBreaks: boolean }): string {
  if (node.nodeType === 3) return (node.textContent ?? "").replace(/\u200b/g, "");
  if (!(node instanceof Element)) return "";
  if (node.tagName === "BR" && node.classList.contains("ProseMirror-trailingBreak")) {
    return opts.trailingBreaks ? "<br.trailing>" : "";
  }
  if (node.tagName === "IMG" && node.classList.contains("ProseMirror-separator")) return "";
  const attrs: string[] = [];
  for (const { name, value } of Array.from(node.attributes)) {
    if (name === "style") {
      const style = normaliseStyle(value);
      if (style) attrs.push(`style="${style}"`);
    } else if (name === "contenteditable" || name === "data-node-view-wrapper" || CHIP_ONLY_ATTRS.includes(name)) {
      continue;
    } else if (name === "class") {
      // ProseMirror marks the selected node; a read-only view has no selection.
      const cls = value.split(/\s+/).filter((c) => c && c !== "ProseMirror-selectednode");
      if (cls.length) attrs.push(`class="${cls.join(" ")}"`);
    } else if (name === "checked") {
      // A DOM property in Vue, an attribute in generated HTML, and happy-dom
      // drops it on the editor's node view. The li's data-checked carries the
      // same fact for every oracle; a dedicated test asserts the live property.
      continue;
    } else {
      attrs.push(`${name}="${value}"`);
    }
  }
  // Deliberate difference: Tiptap 3.31's TaskItem node view drops the
  // data-type its own renderHTML sets, which left the viewer stylesheet's
  // li[data-type="taskItem"] rules matching nothing. The renderer emits it.
  if (node.tagName === "LI" && node.hasAttribute("data-checked") && !node.hasAttribute("data-type")) {
    attrs.push('data-type="taskItem"');
  }
  attrs.sort();
  const children = Array.from(node.childNodes)
    .map((c) => canonical(c, opts))
    .join("");
  // The editor wraps tables in TableView's div; generateHTML does not.
  if (node.tagName === "DIV" && node.classList.contains("tableWrapper")) return children;
  return `<${node.tagName.toLowerCase()}${attrs.length ? " " + attrs.join(" ") : ""}>${children}</${node.tagName.toLowerCase()}>`;
}

/**
 * generateHTML emits TaskItem's static markup (empty label span, no aria-label)
 * while the editor's node view adds an accessible label. Strip that one
 * difference so both oracles compare on structure.
 */
function stripTaskLabel(root: Element): void {
  for (const input of Array.from(root.querySelectorAll("li[data-checked] input"))) {
    input.removeAttribute("aria-label");
  }
  for (const span of Array.from(root.querySelectorAll("li[data-checked] > label > span"))) {
    span.removeAttribute("style");
    span.textContent = "";
  }
}

function canonicalHtml(html: string, trailingBreaks: boolean): string {
  const host = document.createElement("div");
  host.innerHTML = html;
  stripTaskLabel(host);
  return Array.from(host.childNodes)
    .map((n) => canonical(n, { trailingBreaks }))
    .join("");
}

function renderedHtml(doc: unknown): string {
  const wrapper = mount(defineComponent({ render: () => renderStoredDoc(doc) }));
  const html = wrapper.element.innerHTML;
  wrapper.unmount();
  return html;
}

// ── Fixtures ────────────────────────────────────────────────────────────────

const t = (text: string, marks?: { type: string; attrs?: Record<string, unknown> }[]): JSONContent => ({
  type: "text",
  text,
  ...(marks ? { marks } : {}),
});
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

const ALL_MARKS = [
  { type: "link", attrs: { href: "https://example.com/a?b=1&c=2" } },
  { type: "bold" },
  { type: "code" },
  { type: "italic" },
  { type: "strike" },
  { type: "underline" },
  { type: "highlight" },
];

// Nodes whose `renderHTML` the stubs above mirror; they also run in the real
// editor oracle only through generateHTML (the editor would need a Vue app).
const NODE_VIEW_FIXTURES: Record<string, JSONContent> = {
  "entity mention inside marked text and at line end": doc(
    p(t("see "), { type: "entityMention", attrs: { id: "npc-1", entityType: "npc" } }, t(" and "), t("bold", [{ type: "bold" }])),
    p(t("ends with "), { type: "entityMention", attrs: { id: "loc-1", entityType: "location" } }),
  ),
  "calendar event ref": doc(
    p(t("on "), { type: "calendarEventRef", attrs: { eventId: "ev-1", label: "Midwinter", year: 1492, month: null } }),
  ),
  "illustration suggestion": doc(
    p(t("before")),
    { type: "illustrationSuggestion", attrs: { prompt: "A ruined tower <at dusk>" } },
    p(t("after")),
  ),
  "pending image": doc({
    type: "pendingImage",
    attrs: { jobId: "job-1", prompt: "a dragon", size: "1024x1024", status: "pending", startedAt: 1700000000000 },
  }),
  "failed pending image": doc({
    type: "pendingImage",
    attrs: { jobId: "job-2", prompt: "an owlbear", size: "1024x1024", status: "failed" },
  }),
};

const FIXTURES: Record<string, JSONContent> = {
  "empty paragraphs": doc(p(), { type: "paragraph" }, p(t("after the gap"))),
  "plain paragraph": doc(p(t("Hello, <b>world</b> & friends"))),
  "hard breaks": doc(p(t("one"), { type: "hardBreak" }, t("two"), { type: "hardBreak" })),
  "every mark on one run": doc(p(t("all of them", ALL_MARKS))),
  "marks combined across siblings": doc(
    p(
      t("a", [{ type: "bold" }]),
      t("b", [{ type: "bold" }, { type: "italic" }]),
      t("c", [{ type: "italic" }]),
      t("d"),
      t("e", [{ type: "link", attrs: { href: "https://x.test" } }, { type: "bold" }]),
      t("f", [{ type: "link", attrs: { href: "https://x.test" } }]),
      t("g", [{ type: "link", attrs: { href: "https://y.test" } }]),
      t("h", [{ type: "highlight" }, { type: "underline" }]),
      t("i", [{ type: "strike" }, { type: "code" }]),
    ),
  ),
  "link with explicit target, rel and title": doc(
    p(t("l", [{ type: "link", attrs: { href: "mailto:dm@example.com", target: "_self", rel: "nofollow", title: "Mail" } }])),
  ),
  "relative and fragment links": doc(
    p(t("r", [{ type: "link", attrs: { href: "/npcs/1" } }]), t("f", [{ type: "link", attrs: { href: "#top" } }])),
  ),
  headings: doc(
    ...[1, 2, 3, 4, 5, 6].map((level) => ({ type: "heading", attrs: { level }, content: [t(`H${level}`)] })),
    { type: "heading", attrs: { level: 2, textAlign: "center" }, content: [t("centred")] },
  ),
  "heading with an out-of-range level": doc({ type: "heading", attrs: { level: 9 }, content: [t("x")] }),
  "text align": doc(
    ...["left", "center", "right", "justify"].map((textAlign) => ({
      type: "paragraph",
      attrs: { textAlign },
      content: [t(textAlign)],
    })),
    { type: "paragraph", attrs: { textAlign: "diagonal" }, content: [t("not an alignment")] },
    { type: "paragraph", attrs: { textAlign: "left; color: red" }, content: [t("injected declaration")] },
  ),
  "horizontal rule and blockquote": doc(
    { type: "horizontalRule" },
    { type: "blockquote", content: [p(t("quoted")), p(t("twice", [{ type: "italic" }]))] },
  ),
  "code blocks": doc(
    { type: "codeBlock", attrs: { language: "js" }, content: [t("if (a < b) {}")] },
    { type: "codeBlock", content: [t("no language")] },
    { type: "codeBlock" },
  ),
  "bullet, ordered and nested lists": doc(
    {
      type: "bulletList",
      content: [
        { type: "listItem", content: [p(t("one")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("nested"))] }] }] },
        { type: "listItem", content: [p(t("two"))] },
      ],
    },
    { type: "orderedList", attrs: { start: 1 }, content: [{ type: "listItem", content: [p(t("first"))] }] },
    { type: "orderedList", attrs: { start: 4, type: "a" }, content: [{ type: "listItem", content: [p(t("d"))] }] },
    { type: "orderedList", attrs: { start: 1, type: "1" }, content: [{ type: "listItem", content: [p(t("numeric type is the default"))] }] },
  ),
  "task lists, checked and unchecked, nested": doc({
    type: "taskList",
    content: [
      { type: "taskItem", attrs: { checked: true }, content: [p(t("done"))] },
      {
        type: "taskItem",
        attrs: { checked: false },
        content: [p(t("todo")), { type: "taskList", content: [{ type: "taskItem", content: [p(t("sub-task"))] }] }],
      },
      { type: "taskItem", attrs: { checked: false }, content: [p()] },
    ],
  }),
  images: doc(
    { type: "image", attrs: { src: "https://cdn.example.com/a.png", alt: "An <alt>", title: "Title", width: 10, height: 20 } },
    { type: "image", attrs: { src: "/relative/b.png" } },
    { type: "image", attrs: { src: "blob:https://app.test/1234" } },
  ),
  columns: doc({ type: "columns", content: [p(t("left")), p(t("right"))] }),
  "ai-generated wrapper": doc(
    { type: "aiGenerated", attrs: { model: "gpt-x" }, content: [p(t("model text"))] },
    { type: "aiGenerated", content: [p(t("unknown model"))] },
  ),
  "secret block, nested and holding a list": doc({
    type: "secretBlock",
    content: [p(t("the vizier is the lich")), { type: "bulletList", content: [{ type: "listItem", content: [p(t("clue"))] }] }],
  }),
  "table with header row, spans, widths and alignment": doc({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableHeader", attrs: { colspan: 2, colwidth: [100, 200] }, content: [p(t("wide"))] },
          { type: "tableHeader", attrs: { rowspan: 2, align: "center" }, content: [p(t("tall"))] },
        ],
      },
      {
        type: "tableRow",
        content: [
          { type: "tableCell", content: [p(t("a"))] },
          { type: "tableCell", attrs: { colwidth: [50], align: "right" }, content: [p(t("b"))] },
          { type: "tableCell", content: [p(t("c")), p(t("two paragraphs"))] },
        ],
      },
    ],
  }),
  "table of fixed-width columns": doc({
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          { type: "tableCell", attrs: { colwidth: [120] }, content: [p(t("a"))] },
          { type: "tableCell", attrs: { colwidth: [10] }, content: [p(t("below the minimum"))] },
        ],
      },
    ],
  }),
  "a lot at once": doc(
    { type: "heading", attrs: { level: 1 }, content: [t("Title")] },
    p(t("intro "), t("bold", [{ type: "bold" }]), { type: "hardBreak" }),
    { type: "columns", content: [{ type: "bulletList", content: [{ type: "listItem", content: [p(t("in a column"))] }] }] },
    { type: "blockquote", content: [{ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("quoted task"))] }] }] },
  ),
};

describe("viewerRender — parity with Tiptap's generateHTML", () => {
  for (const [name, fixture] of Object.entries({ ...FIXTURES, ...NODE_VIEW_FIXTURES })) {
    it(name, () => {
      const expected = generateHTML(fixture, viewerExtensions());
      expect(canonicalHtml(renderedHtml(fixture), false)).toBe(canonicalHtml(expected, false));
    });
  }
});

describe("viewerRender — parity with a real read-only editor's DOM", () => {
  // The Vue node views need an app to mount, so the editor oracle runs over
  // the plain nodes only (the stubbed ones are covered by generateHTML above).
  for (const [name, fixture] of Object.entries(FIXTURES)) {
    it(name, () => {
      const editor = new Editor({ extensions: viewerExtensions(), content: fixture, editable: false });
      try {
        const root = editor.view.dom as HTMLElement;
        expect(canonicalHtml(renderedHtml(fixture), true)).toBe(canonicalHtml(root.innerHTML, true));
      } finally {
        editor.destroy();
      }
    });
  }
});

describe("viewerRender — wrapper", () => {
  it("renders into a .ProseMirror element, which the viewer's stylesheet targets", () => {
    const wrapper = mount(defineComponent({ render: () => renderStoredDoc(doc(p(t("x")))) }));
    expect(wrapper.element.classList.contains("ProseMirror")).toBe(true);
  });

  it("shows one empty line for no content, like an editor does", () => {
    for (const empty of [null, undefined, "", doc()]) {
      const html = renderedHtml(empty === undefined ? null : empty);
      expect(canonicalHtml(html, true)).toBe("<p><br.trailing></p>");
    }
  });
});

describe("viewerRender — node views render the chips with the right props", () => {
  function chipProps(content: JSONContent) {
    return mount(defineComponent({ render: () => renderStoredDoc(content) }));
  }

  it("passes a mention's type and id, read-only", () => {
    const wrapper = chipProps(doc(p({ type: "entityMention", attrs: { id: "npc-9", entityType: "npc" } })));
    const chip = wrapper.findComponent(EntityMentionChip);
    expect(chip.props()).toEqual({ entityType: "npc", id: "npc-9", editable: false });
  });

  it("drops a mention that names nothing instead of rendering a dead chip", () => {
    const wrapper = chipProps(doc(p(t("x"), { type: "entityMention", attrs: { id: null, entityType: "npc" } })));
    expect(wrapper.html()).not.toContain("entityMention");
  });

  it("passes the calendar ref's event id and label", () => {
    const wrapper = chipProps(doc(p({ type: "calendarEventRef", attrs: { eventId: "ev-3", label: "Feast" } })));
    const chip = wrapper.findComponent(CalendarEventRefChip);
    expect(chip.props()).toEqual({ eventId: "ev-3", label: "Feast", editable: false });
  });

  it("passes the illustration suggestion's prompt, read-only", () => {
    const wrapper = chipProps(doc({ type: "illustrationSuggestion", attrs: { prompt: "a tower" } }));
    const chip = wrapper.findComponent(IllustrationSuggestionChip);
    expect(chip.props()).toEqual({ prompt: "a tower", editable: false });
  });

  it("passes the pending image's status, prompt and start time, defaulting to pending", () => {
    const wrapper = chipProps(
      doc(
        { type: "pendingImage", attrs: { jobId: "j", prompt: "a dragon", startedAt: 5 } },
        { type: "pendingImage", attrs: { jobId: "k", prompt: "x", status: "failed" } },
      ),
    );
    const chips = wrapper.findAllComponents(PendingImageCard);
    expect(chips[0].props()).toEqual({ status: "pending", prompt: "a dragon", startedAt: 5, editable: false });
    expect(chips[1].props()).toEqual({ status: "failed", prompt: "x", startedAt: null, editable: false });
  });
});

describe("viewerRender — read-only task items", () => {
  it("shows a checked item's box checked", () => {
    const wrapper = mount(
      defineComponent({
        render: () =>
          renderStoredDoc(
            doc({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [p(t("x"))] }] }),
          ),
      }),
    );
    expect((wrapper.find("input[type=checkbox]").element as HTMLInputElement).checked).toBe(true);
  });

  it("does not let a click flip the checkbox", async () => {
    const wrapper = mount(
      defineComponent({
        render: () =>
          renderStoredDoc(
            doc({ type: "taskList", content: [{ type: "taskItem", attrs: { checked: false }, content: [p(t("x"))] }] }),
          ),
      }),
    );
    const box = wrapper.find("input[type=checkbox]");
    await box.trigger("click");
    expect((box.element as HTMLInputElement).checked).toBe(false);
  });

  it("labels each checkbox for assistive tech like the editor did", () => {
    const html = renderedHtml(
      doc({ type: "taskList", content: [{ type: "taskItem", content: [p(t("Buy rope"))] }] }),
    );
    expect(html).toContain('aria-label="Task item checkbox for Buy rope"');
  });
});

describe("viewerRender — unknown input", () => {
  it("renders the children of an unknown node and ignores an unknown mark", () => {
    const html = renderedHtml(
      doc({
        type: "futureWidget",
        content: [p(t("kept", [{ type: "sparkle" }, { type: "bold" }]))],
      } as JSONContent),
    );
    expect(canonicalHtml(html, false)).toBe("<div><p><strong>kept</strong></p></div>");
  });

  it("does not log anything to the console", () => {
    const spies = (["log", "warn", "error"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    renderedHtml(doc({ type: "futureWidget" } as JSONContent, { type: "paragraph", content: [{ type: "nope" }] } as JSONContent));
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
  });

  it("survives garbage without throwing", () => {
    for (const garbage of [42, [], { type: 7 }, { type: "doc", content: "x" }, { type: "doc", content: [null, 3, "s"] }]) {
      expect(() => renderedHtml(garbage)).not.toThrow();
    }
  });
});

describe("viewerRender — security", () => {
  it("neutralises a javascript: link, including obfuscated schemes", () => {
    for (const href of ["javascript:alert(1)", "  JaVaScRiPt:alert(1)", "java\tscript:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:x"]) {
      const html = renderedHtml(doc(p(t("click", [{ type: "link", attrs: { href } }]))));
      const a = new DOMParser().parseFromString(html, "text/html").querySelector("a");
      expect(a?.getAttribute("href"), href).toBe("");
    }
  });

  it("keeps ordinary links", () => {
    const html = renderedHtml(doc(p(t("ok", [{ type: "link", attrs: { href: "https://example.com/x" } }]))));
    expect(html).toContain('href="https://example.com/x"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });

  it("never turns attribute JSON into live attributes", () => {
    const html = renderedHtml(
      doc(
        {
          type: "image",
          attrs: { src: "https://cdn.test/a.png", alt: '" onerror="alert(1)', onerror: "alert(1)", onclick: "alert(1)" },
        },
        {
          type: "paragraph",
          attrs: { onmouseover: "alert(1)", style: "background:url(javascript:alert(1))", textAlign: "center" },
          content: [t("x", [{ type: "link", attrs: { href: "https://a.test", onclick: "alert(1)", class: undefined } }])],
        },
      ),
    );
    const parsed = new DOMParser().parseFromString(html, "text/html");
    for (const el of Array.from(parsed.body.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) expect(attr.name.startsWith("on"), attr.name).toBe(false);
    }
    expect(parsed.querySelector("img")?.getAttribute("alt")).toBe('" onerror="alert(1)');
    expect(parsed.querySelector("p")?.getAttribute("style")).toBe("text-align: center;");
  });

  it("drops an image source that could execute", () => {
    for (const src of ["javascript:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "data:image/svg+xml;base64,PHN2Zz4=", "vbscript:x"]) {
      const html = renderedHtml(doc({ type: "image", attrs: { src } }));
      expect(new DOMParser().parseFromString(html, "text/html").querySelector("img")?.hasAttribute("src"), src).toBe(false);
    }
  });

  it("escapes text instead of parsing it as markup", () => {
    const html = renderedHtml(doc(p(t('<img src=x onerror="alert(1)"><script>alert(1)</script>'))));
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img");
  });

  it("renders non-JSON string content as escaped text, not HTML", () => {
    const raw = '<p>hi</p><img src=x onerror="alert(1)">';
    const html = renderedHtml(parseStoredContent(raw));
    expect(html).toContain("&lt;p&gt;hi&lt;/p&gt;");
    expect(new DOMParser().parseFromString(html, "text/html").querySelector("img")).toBeNull();
    // A raw string handed straight to the renderer takes the same path.
    expect(renderedHtml(raw)).toContain("&lt;p&gt;hi&lt;/p&gt;");
  });

  it("treats a JSON string that is not a document as text too", () => {
    expect(canonicalHtml(renderedHtml(parseStoredContent("123")), false)).toBe("<p>123</p>");
    expect(canonicalHtml(renderedHtml(parseStoredContent('"quoted"')), false)).toBe('<p>"quoted"</p>');
  });

  it("renders stored markdown-flavoured prose as paragraphs with emphasis", () => {
    const html = canonicalHtml(renderedHtml(parseStoredContent("First paragraph\nwraps here.\n\n**Bold** then text.")), false);
    expect(html).toBe("<p>First paragraph wraps here.</p><p><strong>Bold</strong> then text.</p>");
  });

  it("parses a JSON string into the document", () => {
    const json = JSON.stringify(doc(p(t("from a string"))));
    expect(canonicalHtml(renderedHtml(parseStoredContent(json)), false)).toBe("<p>from a string</p>");
  });
});

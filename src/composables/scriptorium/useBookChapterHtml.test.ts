// @vitest-environment happy-dom
import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { JSONContent } from "@tiptap/core";
import { useBookChapterHtml } from "./useBookChapterHtml";
import type { ScriptoriumKind } from "@/types/scriptorium.types";

const state = vi.hoisted(() => ({ chapters: [] as unknown[] }));
vi.mock("@/composables/scriptorium/useScriptoriumChapters", async () => {
  const { computed } = await import("vue");
  return { useBookChaptersFull: () => ({ data: computed(() => state.chapters) }) };
});
vi.mock("@/composables/scriptorium/useEntityEmbedData", async () => {
  const { computed } = await import("vue");
  return { useEntityEmbedData: () => ({ lookup: computed(() => ({})) }) };
});

const p = (text: string): JSONContent => ({ type: "paragraph", content: [{ type: "text", text }] });
const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });
const lens: JSONContent = {
  type: "lensPair",
  content: [
    { type: "lensBright", content: [p("bright text")] },
    { type: "lensDeep", content: [p("deep text")] },
  ],
};
const secret: JSONContent = { type: "secretBlock", attrs: { secretId: "x" }, content: [p("hidden plot")] };

function feed(kind: ScriptoriumKind) {
  state.chapters = [
    { id: "a", updated_at: "1", content: doc(p("chapter a"), lens, secret) },
    { id: "b", updated_at: "1", content: doc(p("chapter b")) },
  ];
  const live = ref<{ id: string; json: JSONContent } | null>(null);
  const liveVersion = ref(0);
  const scope = effectScope();
  const result = scope.run(() =>
    useBookChapterHtml({
      documentId: ref("d"),
      kind: ref(kind),
      theme: ref("onednd2024"),
      live,
      liveVersion,
      enabled: ref(true),
    }),
  )!;
  return { ...result, live, liveVersion, scope };
}

describe("useBookChapterHtml", () => {
  it("never hands the layout a DM-only block, in a book or a handout", () => {
    for (const kind of ["book", "handout"] as const) {
      const { chapters, scope } = feed(kind);
      expect(chapters().map((c) => c.html).join(""), kind).not.toContain("hidden plot");
      scope.stop();
    }
  });

  it("a handout's preview drops the Deep half and a book's keeps both", () => {
    const handout = feed("handout");
    expect(handout.chapters()[0]!.html).not.toContain("deep text");
    expect(handout.chapters()[0]!.html).toContain("bright text");
    handout.scope.stop();
    const book = feed("book");
    expect(book.chapters()[0]!.html).toContain("deep text");
    book.scope.stop();
  });

  it("takes the open chapter from the editor, and the others from the saved copy", () => {
    const { chapters, live, liveVersion, scope } = feed("book");
    live.value = { id: "a", json: doc(p("typed just now")) };
    liveVersion.value++;
    const out = chapters();
    expect(out[0]!.html).toContain("typed just now");
    expect(out[1]!.html).toContain("chapter b");
    scope.stop();
  });
});

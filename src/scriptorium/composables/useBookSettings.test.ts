// @vitest-environment happy-dom
import { effectScope, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changedSettings, themeForKind, toSettingsDraft, useBookSettings } from "./useBookSettings";
import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";
import type { PageFurnitureItem, ScriptoriumDocument } from "@/scriptorium/types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
vi.mock("@/composables/useImageUpload", () => ({ ASSET_IMAGES_BUCKET: "asset-images", removeStorageImages: mocks.remove }));
vi.mock("@/scriptorium/composables/useScriptorium", () => ({
  useUpdateScriptoriumDocument: () => ({ mutateAsync: mocks.update }),
}));

const doc = {
  id: "d1", title: "Sothery", kind: "book", doc_type: "custom", campaign_id: null, theme: "onednd2024",
  page_size: "A4", is_two_column: true, ink_friendly: false, show_page_numbers: true, page_number_start: 1,
  footer_text: "", is_published: false, tags: [], page_furniture: [], updated_at: "t1",
} as unknown as ScriptoriumDocument;

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(doc);
  mocks.remove.mockReset().mockResolvedValue(undefined);
});

function mountSettings() {
  const scope = effectScope();
  const settings = scope.run(() => useBookSettings(() => doc))!;
  return { settings, scope };
}

describe("book settings", () => {
  it("sends only the columns that changed", () => {
    const before = toSettingsDraft(doc);
    expect(changedSettings(before, { ...before, pageSize: "A5" })).toEqual({ page_size: "A5" });
  });

  it("keeps an edit that failed to save and sends it on the next try", async () => {
    mocks.update.mockRejectedValueOnce(new Error("offline"));
    const { settings, scope } = mountSettings();
    settings.patch({ footerText: "Late" });
    await nextTick();
    await settings.saveNow();
    expect(settings.status.value).toBe("error");
    expect(settings.draft.footerText).toBe("Late");
    await settings.saveNow();
    expect(mocks.update).toHaveBeenLastCalledWith({ id: "d1", update: { footer_text: "Late" } });
    scope.stop();
  });

  it("does not save a blank title", async () => {
    const { settings, scope } = mountSettings();
    settings.patch({ title: "   " });
    await nextTick();
    await settings.saveNow();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(settings.status.value).toBe("paused");
    scope.stop();
  });

  it("moves to a look that fits the kind", () => {
    expect(themeForKind("handout", "onednd2024")).toBe("letter");
    expect(themeForKind("book", "notice")).toBe("grimoire");
    expect(themeForKind("book", "phb2014")).toBe("phb2014");
    expect(themeForKind("handout", "journal")).toBe("journal");
  });
});

describe("book art cleanup", () => {
  function art(props: Record<string, string>): PageFurnitureItem {
    const item = createFurnitureItem("art", { type: "page", chapterId: "c1", page: 1 });
    return { ...item, props: { ...item.props, ...props } };
  }

  async function saveWith(initial: PageFurnitureItem[], next: PageFurnitureItem[]) {
    const withArt = { ...doc, page_furniture: initial } as unknown as ScriptoriumDocument;
    const scope = effectScope();
    const settings = scope.run(() => useBookSettings(() => withArt))!;
    settings.patch({ furniture: next });
    await nextTick();
    await settings.saveNow();
    scope.stop();
    return mocks.remove.mock.calls.flatMap((c) => c.slice(1)) as string[];
  }

  it("the first bake never deletes the original", async () => {
    const removed = await saveWith(
      [art({ src: "orig.webp", original: "orig.webp" })],
      [art({ src: "bake-a.webp", original: "orig.webp", bakedFor: "h" })],
    );
    expect(removed).toEqual([]);
  });

  it("deletes a superseded bake after the save", async () => {
    const removed = await saveWith(
      [art({ src: "bake-a.webp", original: "orig.webp" })],
      [art({ src: "bake-b.webp", original: "orig.webp" })],
    );
    expect(removed).toEqual(["bake-a.webp"]);
  });

  it("deletes the original once the picture is removed from the book", async () => {
    const removed = await saveWith([art({ src: "bake-a.webp", original: "orig.webp" })], []);
    expect(removed.sort()).toEqual(["bake-a.webp", "orig.webp"]);
  });

  it("deletes nothing when the save fails, so a retry still finds the old picture", async () => {
    mocks.update.mockRejectedValue(new Error("offline"));
    const removed = await saveWith([art({ src: "bake-a.webp", original: "orig.webp" })], []);
    expect(removed).toEqual([]);
  });
});

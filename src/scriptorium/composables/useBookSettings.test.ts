// @vitest-environment happy-dom
import { effectScope, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changedSettings, themeForKind, toSettingsDraft, useBookSettings } from "./useBookSettings";
import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";
import type { PageFurnitureItem, ScriptoriumDocument } from "@/scriptorium/types";

const mocks = vi.hoisted(() => ({ update: vi.fn(), remove: vi.fn() }));
// A file leaves storage only through the sweep; a save only marks it.
vi.mock("@/scriptorium/composables/illuminatorSweep", () => ({ markForSweep: mocks.remove }));
vi.mock("@/lib/supabase", () => ({ supabase: {}, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/scriptorium/composables/useScriptorium", () => ({
  useUpdateScriptoriumDocument: () => ({ mutateAsync: mocks.update }),
}));

const doc = {
  id: "d1", title: "Sothery", kind: "book", doc_type: "custom", campaign_id: null, theme: "onednd2024",
  page_size: "A4", is_two_column: true, ink_friendly: false, show_page_numbers: true, page_number_start: 1,
  footer_text: "", footer_title: "chapter", footer_style: "plain", paper_tone: null, is_published: false, tags: [], page_furniture: [], updated_at: "t1",
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

  it("saves the running title choice by itself, and sends nothing else with it", () => {
    // Bug caught: footer_title left out of the row, so the choice made on a footer is never saved.
    const before = toSettingsDraft(doc);
    expect(changedSettings(before, { ...before, footerTitle: "custom" })).toEqual({ footer_title: "custom" });
  });

  it("saves the paper and the footer style, each as its own column", () => {
    // Bug caught: either left out of the row, so a choice in Book settings never reaches the database.
    const before = toSettingsDraft(doc);
    expect(before).toMatchObject({ paperTone: null, footerStyle: "plain" });
    expect(changedSettings(before, { ...before, paperTone: "grey" })).toEqual({ paper_tone: "grey" });
    expect(changedSettings(before, { ...before, footerStyle: "ribbon" })).toEqual({ footer_style: "ribbon" });
    expect(toSettingsDraft({ ...doc, paper_tone: "parchment", footer_style: "ribbon" })).toMatchObject({
      paperTone: "parchment",
      footerStyle: "ribbon",
    });
  });

  it("saves the page dressing as its own column, and reads a malformed column as none", () => {
    // Fails on: the dressing left out of the row (a choice in Book settings never saved), or a bad column
    // reaching the draft and from there every renderer.
    const dressing = { v: 1, seed: 9, stain: { on: true, strength: 0.6 }, wash: { on: false, strength: 0.5 }, corners: { on: false, strength: 0.8 } } as const;
    const before = toSettingsDraft(doc);
    expect(before.pageDressing).toBeNull();
    expect(changedSettings(before, { ...before, pageDressing: dressing })).toEqual({ page_dressing: dressing });
    expect(changedSettings({ ...before, pageDressing: dressing }, { ...before, pageDressing: null })).toEqual({ page_dressing: null });
    expect(changedSettings(before, before)).toEqual({});
    expect(toSettingsDraft({ ...doc, page_dressing: dressing }).pageDressing).toEqual(dressing);
    expect(toSettingsDraft({ ...doc, page_dressing: { v: 7 } as never }).pageDressing).toBeNull();
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
  const asset = (bucket: string, path: string) => `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}`;
  const bakeA = asset("asset-images", "u1/ill-a.webp");
  const bakeB = asset("asset-images", "u1/ill-b.webp");
  const ownUpload = asset("asset-images", "u1/rte-170.webp");
  const placeArt = asset("location-images", "u2/room.webp");

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
    return mocks.remove.mock.calls.flatMap((c) => c) as string[];
  }

  it("the first bake never deletes the original", async () => {
    const removed = await saveWith(
      [art({ src: ownUpload, original: ownUpload })],
      [art({ src: bakeA, original: ownUpload, bakedFor: "h" })],
    );
    expect(removed).toEqual([]);
  });

  it("marks a superseded bake for the sweep after the save", async () => {
    const removed = await saveWith(
      [art({ src: bakeA, original: placeArt })],
      [art({ src: bakeB, original: placeArt })],
    );
    expect(removed).toEqual([bakeA]);
  });

  // Fails on: removing the picture from the book deleting the original, which may be a place's art or the author's own picture.
  it("marks the bake, never the original, once the picture is removed from the book", async () => {
    for (const original of [placeArt, ownUpload]) {
      mocks.remove.mockClear();
      const removed = await saveWith([art({ src: bakeA, original })], []);
      expect(removed).toEqual([bakeA]);
    }
  });

  it("marks nothing when the save fails, so a retry still finds the old picture", async () => {
    mocks.update.mockRejectedValue(new Error("offline"));
    const removed = await saveWith([art({ src: bakeA, original: placeArt })], []);
    expect(removed).toEqual([]);
  });
});

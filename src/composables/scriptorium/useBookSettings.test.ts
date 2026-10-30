// @vitest-environment happy-dom
import { effectScope, nextTick } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changedSettings, themeForKind, toSettingsDraft, useBookSettings } from "./useBookSettings";
import type { ScriptoriumDocument } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  useUpdateScriptoriumDocument: () => ({ mutateAsync: mocks.update }),
}));

const doc = {
  id: "d1", title: "Sothery", kind: "book", doc_type: "custom", campaign_id: null, theme: "onednd2024",
  page_size: "A4", is_two_column: true, ink_friendly: false, show_page_numbers: true, page_number_start: 1,
  footer_text: "", is_published: false, tags: [], page_furniture: [], updated_at: "t1",
} as unknown as ScriptoriumDocument;

beforeEach(() => {
  mocks.update.mockReset().mockResolvedValue(doc);
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
    expect(themeForKind("book", "notice")).toBe("onednd2024");
    expect(themeForKind("handout", "journal")).toBe("journal");
  });
});

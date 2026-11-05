// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref } from "vue";
import { newScene } from "@/lib/bookNook/edit";
import { StaleNookError } from "./useBookNooks";
import type { BookNook } from "@/types/bookNook.types";

const mocks = vi.hoisted(() => ({
  nook: null as unknown,
  save: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("./useBookNooks", async () => {
  const { ref } = await import("vue");
  class StaleNookError extends Error {
    constructor(public readonly nookId: string) { super("stale"); }
  }
  mocks.nook = ref(null);
  return {
    StaleNookError,
    useBookNook: () => ({ data: mocks.nook, isPending: ref(false), error: ref(null), refetch: mocks.refetch }),
    useSaveBookNook: () => ({ mutateAsync: mocks.save }),
  };
});

import { useNookDraft } from "./useNookDraft";

const scene = newScene({ id: "n1", title: "Cellar", room: { url: "r", width: 2400, height: 1350 } });
const row = (over: Partial<BookNook> = {}): BookNook => ({
  id: "n1", user_id: "u", campaign_id: "c", title: "Cellar", scene, still_url: null, rev: 3, created_at: "", updated_at: "", ...over,
});
const nookRef = () => mocks.nook as ReturnType<typeof ref<BookNook | null>>;

function mountDraft() {
  let out!: ReturnType<typeof useNookDraft>;
  const app = createApp(defineComponent({ setup() { out = useNookDraft("n1"); return () => h("div"); } }));
  app.mount(document.createElement("div"));
  return out;
}

beforeEach(() => {
  mocks.save.mockReset();
  mocks.refetch.mockReset();
  nookRef().value = row();
});

describe("useNookDraft", () => {
  it("saves an edit against the revision it read, and moves on to the revision the save returned", async () => {
    mocks.save.mockResolvedValueOnce(row({ rev: 4 }));
    const d = mountDraft();
    d.apply({ op: "loop", seconds: 16 });
    await nextTick();
    await d.flush();
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ id: "n1", rev: 3 }));
    mocks.save.mockResolvedValueOnce(row({ rev: 5 }));
    d.apply({ op: "loop", seconds: 8 });
    await nextTick();
    await d.flush();
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ rev: 4 }));
  });

  it("pauses autosave on a stale save, keeps the edit, and stops writing until reloaded", async () => {
    // Bug: carrying on after a stale refusal either overwrote the other tab's work or retried forever.
    mocks.save.mockRejectedValueOnce(new StaleNookError("n1"));
    const d = mountDraft();
    d.apply({ op: "loop", seconds: 16 });
    await nextTick();
    await d.flush();
    expect(d.stale.value).toBe(true);
    expect(d.status.value).toBe("paused");
    await d.flush();
    expect(mocks.save).toHaveBeenCalledTimes(1);
    expect(d.draft.scene?.loop).toBe(16);
  });

  it("takes the saved copy on reload, clearing the pause and the unsaved edit", async () => {
    mocks.save.mockRejectedValueOnce(new StaleNookError("n1"));
    const d = mountDraft();
    d.apply({ op: "loop", seconds: 16 });
    await nextTick();
    await d.flush();
    mocks.refetch.mockResolvedValueOnce({ data: row({ rev: 9, title: "Elsewhere" }), error: null });
    await d.reload();
    expect(d.stale.value).toBe(false);
    expect(d.draft.title).toBe("Elsewhere");
    expect(d.draft.scene?.loop).toBe(12);
    expect(d.status.value).toBe("saved");
  });

  it("calls an unsaved draft stale as soon as a newer revision arrives, without waiting to be refused", async () => {
    const d = mountDraft();
    d.apply({ op: "loop", seconds: 16 });
    await nextTick();
    nookRef().value = row({ rev: 4 });
    await nextTick();
    expect(d.stale.value).toBe(true);
  });

  it("does not save a blank title over the real one", async () => {
    const d = mountDraft();
    d.draft.title = "  ";
    await nextTick();
    await d.flush();
    expect(mocks.save).not.toHaveBeenCalled();
    expect(d.status.value).toBe("paused");
  });

  // Bug: the still saved with the revision from before the scene's own save, so the next autosave read as another
  // tab's work and paused the studio.
  it("saves the still after the scene, at the revision the scene's save returned, and carries it forward", async () => {
    mocks.save.mockResolvedValueOnce(row({ rev: 4 }));
    const d = mountDraft();
    d.apply({ op: "loop", seconds: 16 });
    await nextTick();
    mocks.save.mockResolvedValueOnce(row({ rev: 5, still_url: "s.webp" }));
    await d.setStill("s.webp");
    expect(mocks.save).toHaveBeenLastCalledWith({ id: "n1", rev: 4, update: { still_url: "s.webp" } });
    mocks.save.mockResolvedValueOnce(row({ rev: 6 }));
    d.apply({ op: "loop", seconds: 8 });
    await nextTick();
    await d.flush();
    expect(mocks.save).toHaveBeenLastCalledWith(expect.objectContaining({ rev: 5 }));
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, reactive, ref } from "vue";
import { useAutosave, type UseAutosaveHandle } from "./useAutosave";

interface Form { title: string; tags: string[] }

const equal = (a: Form, b: Form) => a.title === b.title && a.tags.join() === b.tags.join();

function setup(options: { save?: (s: Form) => Promise<void>; canSave?: () => boolean } = {}) {
  const save = vi.fn(options.save ?? (async () => undefined));
  const saved: Form = { title: "Saved", tags: [] };
  const draft = reactive<Form>({ ...saved, tags: [...saved.tags] });
  let handle!: UseAutosaveHandle<Form>;
  const wrapper = mount(defineComponent({
    setup() {
      handle = useAutosave({ draft, initial: () => ({ ...saved, tags: [...saved.tags] }), equal, save, canSave: options.canSave });
      return () => null;
    },
  }));
  return { draft, save, wrapper, handle, saved };
}

async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
  await flushPromises();
}

function setVisibility(state: "hidden" | "visible") {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("useAutosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    setVisibility("visible");
  });

  it("starts saved and goes dirty as soon as the draft diverges", async () => {
    const { draft, handle, save } = setup();
    expect(handle.status.value).toBe("saved");
    draft.title = "Edited";
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.status.value).toBe("dirty");
    expect(save).not.toHaveBeenCalled();
  });

  it("debounces: one save, 2s after the last edit", async () => {
    const { draft, save } = setup();
    draft.title = "a";
    await tick(1500);
    draft.title = "ab";
    await tick(1500);
    expect(save).not.toHaveBeenCalled();
    await tick(600);
    expect(save).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledWith({ title: "ab", tags: [] });
  });

  it("saves at maxWait even while edits keep arriving", async () => {
    const { draft, save } = setup();
    for (let i = 0; i < 12; i += 1) {
      draft.title = `edit ${i}`;
      await tick(1000);
    }
    expect(save).toHaveBeenCalled();
  });

  it("pauses while canSave is false and resumes without losing the draft", async () => {
    const ok = ref(false);
    const { draft, save, handle } = setup({ canSave: () => ok.value });
    draft.title = "";
    await tick(2500);
    expect(save).not.toHaveBeenCalled();
    expect(handle.status.value).toBe("paused");
    ok.value = true;
    draft.title = "Back";
    await tick(2100);
    expect(save).toHaveBeenCalledWith({ title: "Back", tags: [] });
    expect(handle.status.value).toBe("saved");
  });

  it("keeps the sent snapshot as baseline: an edit during a save stays dirty and saves again", async () => {
    let release!: () => void;
    const { draft, save, handle } = setup({
      save: (s) => (s.title === "first" ? new Promise<void>((resolve) => { release = resolve; }) : Promise.resolve()),
    });
    draft.title = "first";
    await tick(2100);
    expect(handle.status.value).toBe("saving");
    draft.title = "second";
    await tick(0);
    release();
    await tick(0);
    expect(handle.dirty.value).toBe(true);
    await tick(2100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith({ title: "second", tags: [] });
    expect(draft.title).toBe("second");
    expect(handle.status.value).toBe("saved");
  });

  it("snapshots nested arrays so a later edit cannot rewrite what was sent", async () => {
    const { draft, save } = setup();
    draft.tags.push("a");
    await tick(2100);
    const sent = save.mock.calls[0]![0];
    draft.tags.push("b");
    expect(sent.tags).toEqual(["a"]);
  });

  it("reports an error once and does not loop", async () => {
    const { draft, save, handle } = setup({ save: async () => { throw new Error("nope"); } });
    draft.title = "x";
    await tick(2100);
    expect(handle.status.value).toBe("error");
    expect(handle.saveError.value).toBe("nope");
    await tick(30_000);
    expect(save).toHaveBeenCalledOnce();
    expect(handle.dirty.value).toBe(true);
  });

  it("retries on the next edit after an error", async () => {
    let fail = true;
    const { draft, save, handle } = setup({ save: async () => { if (fail) throw new Error("nope"); } });
    draft.title = "x";
    await tick(2100);
    fail = false;
    draft.title = "xy";
    await tick(2100);
    expect(save).toHaveBeenCalledTimes(2);
    expect(handle.status.value).toBe("saved");
    expect(handle.saveError.value).toBe("");
  });

  it("flushes when the tab hides", async () => {
    const { draft, save } = setup();
    draft.title = "hidden";
    await tick(100);
    setVisibility("hidden");
    await tick(0);
    expect(save).toHaveBeenCalledWith({ title: "hidden", tags: [] });
  });

  it("flushes on unmount and stops listening to visibilitychange", async () => {
    const { draft, save, wrapper } = setup();
    draft.title = "bye";
    await tick(100);
    wrapper.unmount();
    await tick(0);
    expect(save).toHaveBeenCalledOnce();
    save.mockClear();
    setVisibility("hidden");
    await tick(0);
    expect(save).not.toHaveBeenCalled();
  });

  it("reset re-hydrates from a given value without triggering a save", async () => {
    const { draft, save, handle } = setup();
    draft.title = "typing";
    await tick(100);
    handle.reset({ title: "From elsewhere", tags: ["t"] });
    await tick(30_000);
    expect(draft).toEqual({ title: "From elsewhere", tags: ["t"] });
    expect(handle.status.value).toBe("saved");
    expect(save).not.toHaveBeenCalled();
  });

  // A form switching records mid-save: the save that was in flight belongs to
  // the old draft, and must not leave its values behind as the new baseline.
  it("a save that resolves after a reset does not touch the re-hydrated draft", async () => {
    let finish!: () => void;
    const { draft, handle } = setup({ save: () => new Promise<void>((resolve) => { finish = resolve; }) });
    draft.title = "Old record edit";
    await tick(2100);
    expect(handle.saving.value).toBe(true);
    handle.reset({ title: "Other record", tags: [] });
    finish();
    await flushPromises();
    expect(handle.status.value).toBe("saved");
    draft.title = "Other record";
    await vi.advanceTimersByTimeAsync(0);
    expect(handle.dirty.value).toBe(false);
  });

  it("reset with no argument returns to initial()", async () => {
    const { draft, save, handle } = setup();
    draft.title = "typing";
    await tick(100);
    handle.reset();
    await tick(30_000);
    expect(draft.title).toBe("Saved");
    expect(save).not.toHaveBeenCalled();
  });
});

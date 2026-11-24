import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, ref } from "vue";
import { KEPT_RESULT_TTL_MS, useAskFormFillStore } from "@/stores/ui/askFormFill";
import { useAskFormFill } from "./useAskFormFill";

describe("useAskFormFill", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useRealTimers();
  });

  // Bug caught: the card ran against a page whose form was not open, or a form stayed registered after it unmounted.
  it("registers the form while it is mounted and removes it when it unmounts", () => {
    const store = useAskFormFillStore();
    const scope = effectScope();
    scope.run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply: vi.fn() }));
    expect(store.fillerFor("npc_sheet")).not.toBeNull();
    scope.stop();
    expect(store.fillerFor("npc_sheet")).toBeNull();
  });

  // Bug caught: a modal that stays mounted while shut kept offering to fill a form nobody could see.
  it("registers only while the form is open when the page says when", async () => {
    const store = useAskFormFillStore();
    const open = ref(false);
    effectScope().run(() => useAskFormFill("event_description", { context: () => undefined, apply: vi.fn() }, () => open.value));
    expect(store.fillerFor("event_description")).toBeNull();
    open.value = true;
    await nextTick();
    expect(store.fillerFor("event_description")).not.toBeNull();
    open.value = false;
    await nextTick();
    expect(store.fillerFor("event_description")).toBeNull();
  });

  // Bug caught: an old editor closing after a new one mounted unregistered the new one, and the card found no form.
  it("leaves a newer form registered when an older one goes away", () => {
    const store = useAskFormFillStore();
    const first = effectScope();
    first.run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply: vi.fn() }));
    const apply = vi.fn();
    effectScope().run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply }));
    first.stop();
    store.fillerFor<string, undefined>("npc_sheet")?.apply("x");
    expect(apply).toHaveBeenCalledWith("x");
  });

  // Bug caught: credits spent while the editor was closed bought nothing, because the result had nowhere to go.
  it("applies a result kept for this form when it opens again, once", async () => {
    const store = useAskFormFillStore();
    store.keep("npc_sheet", { name: "Mira" });
    const apply = vi.fn();
    effectScope().run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply }));
    await nextTick();
    expect(apply).toHaveBeenCalledExactlyOnceWith({ name: "Mira" });
    expect(store.takeKept("npc_sheet")).toBeNull();
  });

  // Bug caught: a result kept long ago filled a form the DM opened later for something else.
  it("drops a kept result that went stale", async () => {
    vi.useFakeTimers();
    const store = useAskFormFillStore();
    store.keep("npc_sheet", { name: "Mira" });
    vi.advanceTimersByTime(KEPT_RESULT_TTL_MS + 1);
    const apply = vi.fn();
    effectScope().run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply }));
    await nextTick();
    expect(apply).not.toHaveBeenCalled();
  });

  // Bug caught: a kept NPC filled the monster editor.
  it("keeps a result for its own form only", async () => {
    const store = useAskFormFillStore();
    store.keep("npc_sheet", { name: "Mira" });
    const apply = vi.fn();
    effectScope().run(() => useAskFormFill("monster_sheet", { context: () => undefined, apply }));
    await nextTick();
    expect(apply).not.toHaveBeenCalled();
  });
});

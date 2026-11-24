import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick, ref } from "vue";
import { useAskFormFillStore } from "@/stores/ui/askFormFill";
import { useAskFormFill } from "./useAskFormFill";

const registered = (generatorId: string) => Object.values(useAskFormFillStore().forms).filter((f) => f.generatorId === generatorId).length;

describe("useAskFormFill", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Bug caught: the card ran against a page whose form was not open, or a form stayed registered after it unmounted.
  it("registers the form while it is mounted and removes it when it unmounts", () => {
    const scope = effectScope();
    scope.run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply: vi.fn() }));
    expect(registered("npc_sheet")).toBe(1);
    scope.stop();
    expect(registered("npc_sheet")).toBe(0);
  });

  // Bug caught: a modal that stays mounted while shut kept offering to fill a form nobody could see.
  it("registers only while the form is open when the page says when", async () => {
    const open = ref(false);
    effectScope().run(() => useAskFormFill("event_description", { context: () => undefined, apply: vi.fn() }, () => open.value));
    expect(registered("event_description")).toBe(0);
    open.value = true;
    await nextTick();
    expect(registered("event_description")).toBe(1);
    open.value = false;
    await nextTick();
    expect(registered("event_description")).toBe(0);
  });

  // Bug caught: an old editor closing after a new one mounted unregistered the new one, and the card found no form.
  it("leaves a newer form registered when an older one goes away", () => {
    const first = effectScope();
    first.run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply: vi.fn() }));
    effectScope().run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply: vi.fn() }));
    first.stop();
    expect(registered("npc_sheet")).toBe(1);
  });

  // Bug caught: the card was not tied to the form that opened it, so a result went to whichever form of the kind was open.
  it("gives each form its own target, which finds that form's filler and no other", () => {
    const store = useAskFormFillStore();
    const applyA = vi.fn();
    const applyB = vi.fn();
    const a = effectScope().run(() => useAskFormFill<string>("npc_sheet", { context: () => undefined, apply: applyA }));
    const b = effectScope().run(() => useAskFormFill<string>("npc_sheet", { context: () => undefined, apply: applyB }));
    const targetA = a?.bind("npc", "Mira");
    const targetB = b?.bind("npc", "Orrin");
    expect(targetA?.id).not.toBe(targetB?.id);
    store.fillerFor<string, undefined>("npc_sheet", targetA?.id ?? null)?.apply("x");
    expect(applyA).toHaveBeenCalledWith("x");
    expect(applyB).not.toHaveBeenCalled();
  });

  // Bug caught: a kept result filled a form opened later (the 10-minute keep-and-apply-to-next-mount): nothing is kept now.
  it("applies nothing to a form that mounts after the result was made", async () => {
    const apply = vi.fn();
    effectScope().run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply }));
    await nextTick();
    expect(apply).not.toHaveBeenCalled();
  });

  // Bug caught: a form that closed handed out a target that another instance's token could never match.
  it("hands out no target once the form is closed", () => {
    const scope = effectScope();
    const hook = scope.run(() => useAskFormFill("npc_sheet", { context: () => undefined, apply: vi.fn() }));
    expect(hook?.bind("npc", "Mira")).toBeDefined();
    scope.stop();
    expect(hook?.bind("npc", "Mira")).toBeUndefined();
  });
});

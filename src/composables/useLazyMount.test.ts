import { describe, it, expect } from "vitest";
import { nextTick, ref } from "vue";
import { useLazyMount } from "./useLazyMount";

/**
 * The latch is the whole contract: it must not mirror the open flag. Mirroring
 * would unmount a dismissed dialog and discard a half-typed bug report or an
 * in-flight import — the exact behaviour the always-mounted overlays had before
 * they were deferred.
 */
describe("useLazyMount", () => {
  it("stays unmounted until the overlay first opens", async () => {
    const isOpen = ref(false);
    const mounted = useLazyMount(isOpen);

    expect(mounted.value).toBe(false);

    isOpen.value = true;
    await nextTick();
    expect(mounted.value).toBe(true);
  });

  it("stays mounted after the overlay closes again", async () => {
    const isOpen = ref(false);
    const mounted = useLazyMount(isOpen);

    isOpen.value = true;
    await nextTick();
    isOpen.value = false;
    await nextTick();

    expect(mounted.value).toBe(true);
  });

  it("mounts immediately when the overlay starts open", () => {
    const isOpen = ref(true);
    expect(useLazyMount(isOpen).value).toBe(true);
  });
});

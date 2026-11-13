import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const useStorage = vi.fn(() => ref(false));
vi.mock("@vueuse/core", () => ({ useStorage }));

// Evaluating the module must not touch storage. It can be evaluated late,
// through an async component (MemorialTolling loads MemorialCameo with
// defineAsyncComponent), after a test's DOM is torn down; a useStorage at module
// scope then threw an unhandled "Storage is not defined" that failed a CI run
// whose every test had passed.
describe("useLowArt module", () => {
  it("touches storage only when the switch is first used, never while it loads", async () => {
    const { useLowArt } = await import("./useLowArt");
    expect(useStorage).not.toHaveBeenCalled();

    useLowArt();
    useLowArt();
    expect(useStorage).toHaveBeenCalledTimes(1);
  });
});

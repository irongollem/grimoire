// @vitest-environment happy-dom
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

/**
 * The boot modules, evaluated in a browser that blocks site data (#1043).
 * There, reading `window.localStorage` or `sessionStorage` throws a
 * SecurityError, and one such read at module scope stopped the app starting.
 * `storageAccess.test.ts` keeps raw reads out of the source; this proves the
 * modules main.ts loads first, and the stores every page builds, survive it
 * and still remember a write for the life of the tab.
 */

const AREAS = ["localStorage", "sessionStorage"] as const;
const originals = new Map<string, PropertyDescriptor | undefined>();

beforeAll(() => {
  for (const area of AREAS) {
    originals.set(area, Object.getOwnPropertyDescriptor(window, area));
    Object.defineProperty(window, area, {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  }
  vi.resetModules();
});

afterAll(() => {
  for (const area of AREAS) {
    const original = originals.get(area);
    if (original) Object.defineProperty(window, area, original);
  }
});

describe("boot with site data blocked", () => {
  it("evaluates the boot modules", async () => {
    await expect(
      Promise.all([
        import("@/lib/themeRuntime"),
        import("@/lib/authSnapshot"),
        import("@/lib/supabase"),
        import("@/lib/staleChunkRecovery"),
        import("@/lib/authIdentityChange"),
        import("@/stores/auth"),
        import("@/stores/campaign"),
        import("@/stores/calendar"),
        import("@/stores/ui"),
        import("@/stores/cardForge"),
        import("@/stores/soundboard"),
        import("@/stores/spotify"),
        import("@/router/index"),
      ]),
    ).resolves.toBeDefined();
  });

  it("builds the stores every page uses and runs them on memory", async () => {
    setActivePinia(createPinia());
    const { useAuthStore } = await import("@/stores/auth");
    const { useCampaignStore } = await import("@/stores/campaign");
    const { useUiStore } = await import("@/stores/ui");
    const { useCardForgeStore } = await import("@/stores/cardForge");
    const { useCalendarStore } = await import("@/stores/calendar");
    const { readStoredSession } = await import("@/lib/supabase");

    expect(() => {
      useAuthStore();
      useUiStore();
      useCardForgeStore();
      useCalendarStore();
    }).not.toThrow();
    expect(readStoredSession()).toBeNull();

    const campaign = useCampaignStore();
    expect(campaign.activeCampaignId).toBeNull();
    campaign.activeCampaignId = "c-1";
    const { safeLocalStorage } = await import("@/lib/safeLocalStorage");
    await vi.waitFor(() => expect(safeLocalStorage().getItem("grimoire_active_campaign")).toBe("c-1"));
  });

  it("sends AI generation to the server when the local key cannot be read", async () => {
    setActivePinia(createPinia());
    const { textRunsOnLocalKey, imagesRunOnLocalKey } = await import("@/ai/localKeyMode");
    expect(await textRunsOnLocalKey()).toBe(false);
    expect(await imagesRunOnLocalKey()).toBe(false);
  });
});

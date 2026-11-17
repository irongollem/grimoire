import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sendItemDrop: vi.fn(),
  auth: { isDM: true },
  appUi: { dmPreviewMode: false },
  rule: { value: true },
}));

vi.mock("@/composables/campaign/useCampaignMessages", () => ({
  useCampaignMessages: () => ({ sendItemDrop: mocks.sendItemDrop }),
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => mocks.auth }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => mocks.appUi }));
vi.mock("@/composables/rules/useOptionalRules", () => ({ useIsRuleEnabled: () => mocks.rule }));

import { useDropItem, useLootDropChoice, useLootDropPolicy } from "./useLootDropChoice";

beforeEach(() => {
  mocks.sendItemDrop.mockReset().mockResolvedValue(undefined);
  mocks.auth.isDM = true;
  mocks.appUi.dmPreviewMode = false;
  mocks.rule.value = true;
  useLootDropChoice().resolve(null);
});

describe("the DM is asked at every drop only while the rule is on", () => {
  it.each([
    ["the rule is off", () => { mocks.rule.value = false; }],
    ["the sender is a player", () => { mocks.auth.isDM = false; }],
    ["the DM is previewing the player view", () => { mocks.appUi.dmPreviewMode = true; }],
  ])("a drop goes straight out, unasked, when %s", async (_why, setup) => {
    setup();
    expect(useLootDropPolicy().asks.value).toBe(false);
    const { dropItem } = useDropItem();
    await expect(dropItem("Rope", "i1", 1, null)).resolves.toBe(true);
    expect(useLootDropChoice().request.value).toBeNull();
    expect(mocks.sendItemDrop).toHaveBeenCalledWith("Rope", "i1", 1, null, undefined);
  });

  it("the DM with the rule on is asked, naming the stack size", async () => {
    expect(useLootDropPolicy().asks.value).toBe(true);
    const pending = useDropItem().dropItem("Rope", "i1", 3, null);
    expect(useLootDropChoice().request.value?.itemLabel).toBe("3× Rope");
    useLootDropChoice().resolve(null);
    await pending;
  });
});

describe("the DM's answer decides how the drop is posted", () => {
  it("cancelling the prompt posts nothing", async () => {
    const pending = useDropItem().dropItem("Rope", "i1", 1, null);
    useLootDropChoice().resolve(null);
    await expect(pending).resolves.toBe(false);
    expect(mocks.sendItemDrop).not.toHaveBeenCalled();
  });

  it("Free to grab sends rollMode free, keeping the caller's own options", async () => {
    const pending = useDropItem().dropItem("Rope", "i1", 1, null, { thrown: true });
    useLootDropChoice().resolve({ mode: "free" });
    await expect(pending).resolves.toBe(true);
    expect(mocks.sendItemDrop).toHaveBeenCalledWith("Rope", "i1", 1, null, { thrown: true, rollMode: "free" });
  });

  it("Give to a character sends that member id and no roll mode", async () => {
    const pending = useDropItem().dropItem("Rope", "i1", 1, null);
    useLootDropChoice().resolve({ mode: "give", partyMemberId: "pm7" });
    await pending;
    expect(mocks.sendItemDrop).toHaveBeenCalledWith("Rope", "i1", 1, null, { giveTo: "pm7" });
  });
});

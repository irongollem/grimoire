import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HandoutShareDialog from "./HandoutShareDialog.vue";
import type { HandoutShareResult } from "@/types/scriptorium.types";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  share: vi.fn(),
  takeBack: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([
      { id: "p1", name: "Mira", player_name: "Sam" },
      { id: "p2", name: "Tor", player_name: null },
      { id: "p3", name: "Ash", player_name: "Ilse" },
    ]),
  }),
}));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ success: mocks.toastSuccess, error: vi.fn() }) }));
vi.mock("@/composables/scriptorium/useScriptorium", () => ({
  previewHandoutShare: (...args: unknown[]) => mocks.preview(...args),
}));
vi.mock("@/composables/scriptorium/useHandoutShare", () => ({
  shareErrorMessage: (e: unknown) => (e instanceof Error ? e.message : "failed"),
  useHandoutSharing: () => ({
    share: (...args: unknown[]) => mocks.share(...args),
    takeBack: (...args: unknown[]) => mocks.takeBack(...args),
    isSharing: ref(false),
  }),
}));
// The pin half has its own tests; here it only has to appear when asked for.
vi.mock("@/components/scriptorium/HandoutPinUp.vue", () => ({ default: { template: '<div data-testid="pin-half">pin half</div>' } }));

const handout = {
  id: "d1",
  title: "The Tithe Ledger",
  campaign_id: "c1",
  player_visible_to: [] as string[],
  updated_at: "2026-10-04T10:00:00Z",
  theme: "letter" as const,
};

const result: HandoutShareResult = {
  revealed: [
    { type: "npc", id: "n1", name: "Ser Vallis", fields: ["name"], seen_as: "The Almoner" },
    { type: "quest", id: "q1", name: "The Bounty", starts: true },
  ],
  withheld: [{ type: "monster", id: "m1", name: "Tithe Wraith", reason: "not_revealed" }],
  added: ["p1"],
  removed: [],
};

function mountDialog(props: Record<string, unknown> = {}) {
  return mount(HandoutShareDialog, {
    props: { open: true, handout, initialRecipients: ["p1"], ...props },
    attachTo: document.body,
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]],
      stubs: { transition: false },
    },
  });
}

const bodyText = () => document.body.textContent ?? "";
const button = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.includes(label));
const boxes = () => [...document.body.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
const checked = () => boxes().map((c) => c.checked);

describe("HandoutShareDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mocks.preview.mockReset().mockResolvedValue(result);
    mocks.share.mockReset().mockResolvedValue(result);
    mocks.takeBack.mockReset();
    mocks.toastSuccess.mockReset();
  });

  it("is one screen: who gets it on one side, and the dry run in plain words on the other", async () => {
    mountDialog();
    await flushPromises();
    expect(mocks.preview).toHaveBeenCalledWith("d1", ["p1"]);
    const text = bodyText();
    expect(text).toContain("Mira");
    expect(text).toContain("Giving it also reveals".toUpperCase());
    expect(text).toContain("Ser Vallis: name (seen as The Almoner)");
    expect(text).toContain("The Bounty: the quest starts");
    expect(text).toContain("They will not see".toUpperCase());
    expect(text).toContain("Tithe Wraith: set not to reveal");
  });

  it("re-runs the dry run as the ticks change, so the right side never describes a stale choice", async () => {
    mountDialog();
    await flushPromises();
    boxes()[1].click();
    await flushPromises();
    expect(mocks.preview).toHaveBeenLastCalledWith("d1", ["p1", "p2"]);
  });

  it("writes nothing until Give it, then gives to exactly the ticked members", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    expect(mocks.share).not.toHaveBeenCalled();
    button("Give it")?.click();
    await flushPromises();
    expect(mocks.share).toHaveBeenCalledWith("d1", ["p1"]);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("says who is new and who already has it", async () => {
    mocks.preview.mockResolvedValue({ ...result, added: ["p3"] });
    mountDialog({ handout: { ...handout, player_visible_to: ["p1", "p2"] }, initialRecipients: null });
    await flushPromises();
    boxes()[2].click();
    await flushPromises();
    expect(bodyText()).toContain("Ash is new; Mira and Tor already have it.");
  });

  it("starts on the current holders, else on the suggested ones, never both", async () => {
    mountDialog({ initialRecipients: ["p1", "p2"] });
    await flushPromises();
    expect(checked()).toEqual([true, true, false]);
    document.body.innerHTML = "";
    mountDialog({ initialRecipients: ["p1"], handout: { ...handout, player_visible_to: ["p2"] } });
    await flushPromises();
    expect(checked()).toEqual([false, true, false]);
  });

  it("Whole party ticks everyone and, once everyone is ticked, clears them again", async () => {
    mountDialog({ initialRecipients: null });
    await flushPromises();
    expect(checked()).toEqual([false, false, false]);
    button("Whole party")?.click();
    await flushPromises();
    expect(checked()).toEqual([true, true, true]);
    button("Clear all")?.click();
    await flushPromises();
    expect(checked()).toEqual([false, false, false]);
  });

  it("asks the server for no dry run while nobody is ticked", async () => {
    mountDialog({ initialRecipients: null });
    await flushPromises();
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(bodyText()).toContain("Tick who gets it");
    expect(button("Give it")?.hasAttribute("disabled")).toBe(true);
  });

  it("offers to take a given handout back when everyone is unticked", async () => {
    mocks.takeBack.mockResolvedValue(true);
    const wrapper = mountDialog({ handout: { ...handout, player_visible_to: ["p1"] } });
    await flushPromises();
    expect(button("Take it back")).toBeUndefined();
    boxes()[0].click();
    await flushPromises();
    expect(button("Give it")).toBeUndefined();
    button("Take it back")?.click();
    await flushPromises();
    expect(mocks.takeBack).toHaveBeenCalledWith("d1");
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("keeps the dialog open when taking the handout back is declined or fails", async () => {
    mocks.takeBack.mockResolvedValue(false);
    const wrapper = mountDialog({ handout: { ...handout, player_visible_to: ["p1"] } });
    await flushPromises();
    boxes()[0].click();
    await flushPromises();
    button("Take it back")?.click();
    await flushPromises();
    expect(wrapper.emitted("close")).toBeUndefined();
  });

  it("says nothing would change when the dry run is empty, and gives nothing", async () => {
    mocks.preview.mockResolvedValue({ revealed: [], withheld: [], added: [], removed: [] });
    mountDialog({ handout: { ...handout, player_visible_to: ["p1"] } });
    await flushPromises();
    expect(bodyText()).toContain("Nothing would change.");
    expect(button("Reveal")?.hasAttribute("disabled")).toBe(true);
  });

  it("lets the DM reveal linked content when the holders are unchanged, and calls it Reveal", async () => {
    mocks.preview.mockResolvedValue({ ...result, added: [], removed: [] });
    mountDialog({ handout: { ...handout, player_visible_to: ["p1"] } });
    await flushPromises();
    expect(button("Reveal")?.hasAttribute("disabled")).toBe(false);
  });

  it("says how many players were added, singular and plural, and that a give with no new player only updated", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    button("Give it")?.click();
    await flushPromises();
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith("Given to 1 player.");
    wrapper.unmount();

    document.body.innerHTML = "";
    mocks.share.mockResolvedValue({ ...result, added: ["p1", "p2"] });
    mountDialog({ initialRecipients: ["p1", "p2"] });
    await flushPromises();
    button("Give it")?.click();
    await flushPromises();
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith("Given to 2 players.");

    document.body.innerHTML = "";
    mocks.share.mockResolvedValue({ ...result, added: [] });
    mountDialog();
    await flushPromises();
    button("Give it")?.click();
    await flushPromises();
    expect(mocks.toastSuccess).toHaveBeenLastCalledWith("Handout updated.");
  });

  it("shows why giving failed and stays open", async () => {
    mocks.share.mockRejectedValue(new Error("Handout is locked"));
    const wrapper = mountDialog();
    await flushPromises();
    button("Give it")?.click();
    await flushPromises();
    expect(bodyText()).toContain("Handout is locked");
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
  });

  it("switches to pinning on a board and back, opening on Hand it over each time", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="pin-half"]')).toBeNull();
    button("Pin it on a board")?.click();
    await flushPromises();
    expect(document.body.querySelector('[data-testid="pin-half"]')).not.toBeNull();
    expect(button("Give it")).toBeUndefined();
    await wrapper.setProps({ open: false });
    await wrapper.setProps({ open: true });
    await flushPromises();
    expect(document.body.querySelector('[data-testid="pin-half"]')).toBeNull();
  });
});

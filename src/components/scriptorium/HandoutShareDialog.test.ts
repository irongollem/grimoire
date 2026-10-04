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
}));

vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({
    data: ref([
      { id: "p1", name: "Mira", player_name: "Sam" },
      { id: "p2", name: "Tor", player_name: null },
    ]),
  }),
}));
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

const handout = {
  id: "d1",
  title: "The Tithe Ledger",
  campaign_id: "c1",
  player_visible_to: [] as string[],
  updated_at: "2026-10-04T10:00:00Z",
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
    props: { open: true, handout, proposed: ["p1"], ...props },
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

describe("HandoutShareDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    mocks.preview.mockReset().mockResolvedValue(result);
    mocks.share.mockReset().mockResolvedValue(result);
    mocks.takeBack.mockReset();
  });

  it("opens on the confirmation when the audience was already chosen, and lists the dry run in plain words", async () => {
    mountDialog();
    await flushPromises();
    expect(mocks.preview).toHaveBeenCalledWith("d1", ["p1"]);
    const text = bodyText();
    expect(text).toContain("Mira");
    expect(text).toContain("Ser Vallis: name (seen as The Almoner)");
    expect(text).toContain("The Bounty: the quest starts");
    expect(text).toContain("Tithe Wraith: set not to reveal");
  });

  it("writes nothing until confirmed, then shares with the chosen recipients", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    expect(mocks.share).not.toHaveBeenCalled();
    button("Share with players")?.click();
    await flushPromises();
    expect(mocks.share).toHaveBeenCalledWith("d1", ["p1"]);
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("opens on the picker when no audience was chosen and moves on with Review", async () => {
    mountDialog({ proposed: null });
    await flushPromises();
    expect(bodyText()).toContain("WHO RECEIVES IT");
    expect(button("Review")?.hasAttribute("disabled")).toBe(true);
    (document.body.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await flushPromises();
    button("Review")?.click();
    await flushPromises();
    expect(mocks.preview).toHaveBeenCalledWith("d1", ["p1"]);
  });

  it("offers to take a shared handout back when the picker is emptied", async () => {
    mocks.takeBack.mockResolvedValue(true);
    const wrapper = mountDialog({
      proposed: null,
      handout: { ...handout, player_visible_to: ["p1"] },
    });
    await flushPromises();
    expect(button("Take it back")).toBeUndefined();
    // Seeded with the current recipients; untick the only one.
    (document.body.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    await flushPromises();
    button("Take it back")?.click();
    await flushPromises();
    expect(mocks.takeBack).toHaveBeenCalledWith("d1");
    expect(wrapper.emitted("close")).toBeTruthy();
  });

  it("says nothing would change when the dry run is empty", async () => {
    mocks.preview.mockResolvedValue({ revealed: [], withheld: [], added: [], removed: [] });
    mountDialog({ handout: { ...handout, player_visible_to: ["p1"] } });
    await flushPromises();
    expect(bodyText()).toContain("Nothing would change.");
    expect(button("Reveal")?.hasAttribute("disabled")).toBe(true);
  });
});

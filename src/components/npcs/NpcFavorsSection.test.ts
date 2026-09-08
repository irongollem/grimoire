import { flushPromises, mount, RouterLinkStub } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import NpcFavorsSection from "./NpcFavorsSection.vue";
import type { NpcFavor } from "@/types/quest.types";

const routerStubs = { RouterLink: RouterLinkStub };

function favor(overrides: Partial<NpcFavor> & { id: string }): NpcFavor {
  return {
    campaign_id: "c1",
    npc_id: "npc1",
    quest_id: null,
    text: "Owes the party a favour",
    source_event_id: null,
    settled_at: null,
    created_by: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  } as NpcFavor;
}

const mocks = vi.hoisted(() => ({
  favors: { value: [] as NpcFavor[] },
  quests: { value: [] as Array<{ id: string; title: string }> },
  createFavor: vi.fn(),
  settleFavor: vi.fn(),
  deleteFavor: vi.fn(),
  createPending: false,
  settlePending: false,
  confirmResult: true,
}));

vi.mock("@/composables/npcs/useNpcFavors", () => ({
  useNpcFavors: () => ({ data: mocks.favors }),
  useCreateNpcFavor: () => ({
    mutateAsync: mocks.createFavor,
    isPending: { value: mocks.createPending },
  }),
  useSettleNpcFavor: () => ({
    mutateAsync: mocks.settleFavor,
    isPending: { value: mocks.settlePending },
  }),
  useDeleteNpcFavor: () => ({ mutateAsync: mocks.deleteFavor }),
}));

vi.mock("@/composables/quests/useQuests", () => ({
  useQuests: () => ({ data: mocks.quests }),
}));

vi.mock("@/composables/useConfirm", () => ({
  useConfirm: () => ({ confirm: vi.fn().mockImplementation(() => Promise.resolve(mocks.confirmResult)) }),
}));

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({ activeCampaignId: "c1" }),
}));

describe("NpcFavorsSection", () => {
  beforeEach(() => {
    mocks.favors.value = [];
    mocks.quests.value = [];
    mocks.createFavor.mockReset().mockResolvedValue(undefined);
    mocks.settleFavor.mockReset().mockResolvedValue(undefined);
    mocks.deleteFavor.mockReset().mockResolvedValue(undefined);
    mocks.createPending = false;
    mocks.settlePending = false;
    mocks.confirmResult = true;
  });

  it("shows the empty state when the NPC owes nothing", () => {
    const wrapper = mount(NpcFavorsSection, {
      props: { npcId: "npc1" },
      global: { stubs: routerStubs },
    });
    expect(wrapper.text()).toContain("This NPC owes the party nothing yet.");
  });

  it("splits unsettled and settled favours, with settled ones under their own divider", () => {
    mocks.favors.value = [
      favor({ id: "f1", text: "Unsettled one" }),
      favor({ id: "f2", text: "Settled one", settled_at: "2026-01-05T00:00:00Z" }),
    ];
    const wrapper = mount(NpcFavorsSection, {
      props: { npcId: "npc1" },
      global: { stubs: routerStubs },
    });
    expect(wrapper.text()).toContain("Unsettled one");
    expect(wrapper.text()).toContain("Settled one");
    expect(wrapper.text()).toContain("Settled");
    const settleButtons = wrapper.findAll("button").filter((b) => b.text() === "Settle");
    expect(settleButtons).toHaveLength(1);
  });

  it("calls the settle mutation with the favour and NPC id when Settle is clicked", async () => {
    mocks.favors.value = [favor({ id: "f1", text: "Unsettled one" })];
    const wrapper = mount(NpcFavorsSection, {
      props: { npcId: "npc1" },
      global: { stubs: routerStubs },
    });
    const settleButton = wrapper.findAll("button").find((b) => b.text() === "Settle");
    await settleButton!.trigger("click");
    expect(mocks.settleFavor).toHaveBeenCalledWith({ id: "f1", npcId: "npc1" });
  });

  it("disables Add favour while the input is blank", async () => {
    const wrapper = mount(NpcFavorsSection, {
      props: { npcId: "npc1" },
      global: { stubs: routerStubs },
    });
    const addButton = wrapper.findAll("button").find((b) => b.text() === "Add favour");
    expect(addButton?.attributes("disabled")).toBeDefined();

    await wrapper.find("input").setValue("New favour text");
    expect(addButton?.attributes("disabled")).toBeUndefined();

    await addButton!.trigger("click");
    expect(mocks.createFavor).toHaveBeenCalledWith({
      campaign_id: "c1",
      npc_id: "npc1",
      quest_id: null,
      text: "New favour text",
      source_event_id: null,
    });
  });

  it("resolves a quest link when the favour's quest_id matches a known quest", () => {
    mocks.quests.value = [{ id: "q1", title: "The Sealed Crypt" }];
    mocks.favors.value = [favor({ id: "f1", quest_id: "q1" })];
    const wrapper = mount(NpcFavorsSection, {
      props: { npcId: "npc1" },
      global: { stubs: routerStubs },
    });
    const link = wrapper.findComponent(RouterLinkStub);
    expect(link.props("to")).toBe("/quests/q1");
    expect(link.text()).toBe("The Sealed Crypt");
  });

  it("confirms before deleting a settled favour", async () => {
    mocks.favors.value = [favor({ id: "f1", settled_at: "2026-01-05T00:00:00Z" })];
    const wrapper = mount(NpcFavorsSection, {
      props: { npcId: "npc1" },
      global: { stubs: routerStubs },
    });
    // The delete action is the icon-only button in the settled row — every
    // other button on the page (Add favour) carries visible text.
    const deleteButton = wrapper.findAll("button").find((b) => b.text() === "");
    await deleteButton!.trigger("click");
    await flushPromises();
    expect(mocks.deleteFavor).toHaveBeenCalledWith({ id: "f1", npcId: "npc1" });
  });
});

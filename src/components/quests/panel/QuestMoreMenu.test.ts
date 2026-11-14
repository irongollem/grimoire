import { flushPromises, mount } from "@vue/test-utils";
import { defineComponent, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import QuestMoreMenu from "./QuestMoreMenu.vue";
import type { Quest } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  fetchNpc: vi.fn(),
  fetchLocation: vi.fn(),
  deleteQuest: vi.fn(),
  createScriptoriumDocument: vi.fn(),
  confirm: vi.fn(),
  push: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/npcs/useNpcs", () => ({ useFetchNpc: () => mocks.fetchNpc }));
vi.mock("@/composables/locations/useLocations", () => ({ useFetchLocation: () => mocks.fetchLocation }));
vi.mock("@/scriptorium/composables/useScriptorium", () => ({ useCreateScriptoriumBook: () => ({ mutateAsync: mocks.createScriptoriumDocument }) }));
vi.mock("@/composables/quests/useQuests", () => ({
  useQuestObjectives: () => ({ data: ref([]) }),
  useDeleteQuest: () => ({ mutateAsync: mocks.deleteQuest }),
}));
vi.mock("vue-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: mocks.toastError, fromError: (e: unknown) => (e instanceof Error ? e.message : String(e)) }) }));

// The real popover teleports to body and anchors itself; what is under test is
// the two items and what they do, so the shell just renders its slots open.
const MenuPopoverStub = defineComponent({
  template: '<div><slot name="trigger" :toggle="() => {}" :open="true" /><slot :close="() => {}" /></div>',
});

const quest = { id: "quest-1", title: "The Unseen", status: "active", giver_npc_id: null, location_id: null, campaign_id: "campaign-1" } as Quest;

function mountMenu(overrides: Partial<Quest> = {}) {
  return mount(QuestMoreMenu, { props: { quest: { ...quest, ...overrides } as Quest }, global: { stubs: { MenuPopover: MenuPopoverStub, PaywallModal: true } } });
}
const item = (w: ReturnType<typeof mountMenu>, label: string) => w.findAllComponents({ name: "AppButton" }).find((b) => b.attributes("aria-label") === label)!;

describe("QuestMoreMenu", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
  });

  it("offers Send to Scriptorium and Delete quest", () => {
    const wrapper = mountMenu();
    expect(item(wrapper, "Send to Scriptorium").exists()).toBe(true);
    expect(item(wrapper, "Delete quest").exists()).toBe(true);
  });

  // Fails on a delete that skips the confirm: a declined confirm must keep the quest.
  it("a declined confirm deletes nothing and stays on the quest", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountMenu();
    await item(wrapper, "Delete quest").trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith('Delete "The Unseen"?');
    expect(mocks.deleteQuest).not.toHaveBeenCalled();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("a confirmed delete removes the quest and returns to the quest list, never to the quest's own page", async () => {
    mocks.confirm.mockResolvedValue(true);
    const wrapper = mountMenu();
    await item(wrapper, "Delete quest").trigger("click");
    await flushPromises();
    expect(mocks.deleteQuest).toHaveBeenCalledWith("quest-1");
    expect(mocks.push).toHaveBeenCalledWith("/quests");
  });

  it("names the quest by 'this quest' when it has no title", async () => {
    mocks.confirm.mockResolvedValue(false);
    await item(mountMenu({ title: "" }), "Delete quest").trigger("click");
    expect(mocks.confirm).toHaveBeenLastCalledWith('Delete "this quest"?');
  });

  it("sends the quest to Scriptorium in the quest's own campaign and opens the document", async () => {
    mocks.createScriptoriumDocument.mockResolvedValue({ id: "doc-1" });
    await item(mountMenu({ campaign_id: "campaign-7" }), "Send to Scriptorium").trigger("click");
    await flushPromises();
    expect(mocks.createScriptoriumDocument).toHaveBeenCalledWith({
      book: expect.objectContaining({ campaign_id: "campaign-7", kind: "book" }),
      chapters: [{ content: expect.objectContaining({ type: "doc" }) }],
    });
    expect(mocks.push).toHaveBeenCalledWith("/scriptorium/doc-1");
    expect(mocks.fetchNpc).not.toHaveBeenCalled();
  });

  it("a Scriptorium document refused for quota opens the paywall quietly; any other failure is toasted", async () => {
    const wrapper = mountMenu();
    mocks.createScriptoriumDocument.mockRejectedValueOnce({ message: "quota_exceeded" });
    await item(wrapper, "Send to Scriptorium").trigger("click");
    await flushPromises();
    expect(wrapper.findComponent({ name: "PaywallModal" }).props("modelValue")).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
    mocks.createScriptoriumDocument.mockRejectedValueOnce(new Error("Disk full"));
    await item(wrapper, "Send to Scriptorium").trigger("click");
    await flushPromises();
    expect(mocks.toastError).toHaveBeenCalledWith("Disk full");
  });
});

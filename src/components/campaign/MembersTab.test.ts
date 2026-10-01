import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MembersTab from "./MembersTab.vue";

/** Seating a character nobody owns hands it to the player, so it asks first (#943). */
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  confirm: vi.fn<() => Promise<boolean>>(),
}));

const member = { id: "m1", user_id: "u1", role: "player", display_name: "Robin", party_member_id: null };
const party = [
  { id: "p1", name: "Orphan", class: null, level: null, owner_user_id: null, is_dm_managed: false },
  { id: "p2", name: "Mine", class: null, level: null, owner_user_id: "u1", is_dm_managed: false },
];

vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: { value: [member] }, isPending: { value: false } }),
  useUpdateCampaignMember: () => ({ mutate: mocks.mutate }),
  useRemoveCampaignMember: () => ({ isPending: { value: false }, mutate: vi.fn() }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { value: party }, isPending: { value: false } }),
  useDeletePartyMember: () => ({ isPending: { value: false }, mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/party/useCharacterPool", () => ({
  useDetachCharacter: () => ({ isPending: { value: false }, mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/campaign/useCampaignPresence", () => ({
  useCampaignPresence: () => ({ isOnline: () => false }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ error: vi.fn(), fromError: () => "failed" }),
}));

const EntityComboboxStub = {
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template: "<div />",
};

function mountTab() {
  return mount(MembersTab, { global: { stubs: { EntityCombobox: EntityComboboxStub } } });
}

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.confirm.mockReset();
});

describe("MembersTab", () => {
  it("asks before giving away an unowned character, and assigns once confirmed", async () => {
    mocks.confirm.mockResolvedValue(true);
    const wrapper = mountTab();
    wrapper.findComponent(EntityComboboxStub).vm.$emit("update:modelValue", "p1");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith(
      "It becomes their character. They keep it if they leave the campaign, and only they can delete it.",
      expect.objectContaining({ title: "Give Orphan to Robin?", confirmLabel: "Give character" }),
    );
    expect(mocks.mutate).toHaveBeenCalledWith(
      { id: "m1", update: { party_member_id: "p1" } },
      expect.anything(),
    );
  });

  it("does nothing when the hand-over is cancelled", async () => {
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountTab();
    wrapper.findComponent(EntityComboboxStub).vm.$emit("update:modelValue", "p1");
    await flushPromises();
    expect(mocks.mutate).not.toHaveBeenCalled();
  });

  it("does not ask for a character the player already owns, or when clearing a seat", async () => {
    const wrapper = mountTab();
    wrapper.findComponent(EntityComboboxStub).vm.$emit("update:modelValue", "p2");
    await flushPromises();
    wrapper.findComponent(EntityComboboxStub).vm.$emit("update:modelValue", "");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.mutate).toHaveBeenCalledTimes(2);
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MembersTab from "./MembersTab.vue";

/** Seating a character nobody owns hands it to the player, so it asks first (#943). */
const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  confirm: vi.fn<() => Promise<boolean>>(),
  setRole: vi.fn(),
  isOwner: { value: true },
  me: { value: "owner" },
  rows: { value: [] as unknown[] },
}));

const member = { id: "m1", user_id: "u1", role: "player", display_name: "Robin", party_member_id: null };
const ownerRow = { id: "m0", user_id: "owner", role: "dm", display_name: "Ola", party_member_id: null };
const coDmRow = { id: "m2", user_id: "u2", role: "dm", display_name: "Cass", party_member_id: "p2" };
const party = [
  { id: "p1", name: "Orphan", class: null, level: null, owner_user_id: null, is_dm_managed: false },
  { id: "p2", name: "Mine", class: null, level: null, owner_user_id: "u1", is_dm_managed: false },
];

vi.mock("@/composables/memorials/useMemorials", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/memorials/useMemorials")>()),
  useCampaignMemorials: () => ({ data: { value: [] } }),
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({ data: mocks.rows, isPending: { value: false } }),
  useUpdateCampaignMember: () => ({ mutate: mocks.mutate }),
  useSetMemberRole: () => ({ isPending: { value: false }, mutate: mocks.setRole }),
  useRemoveCampaignMember: () => ({ isPending: { value: false }, mutate: vi.fn() }),
}));
vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => ({
    get isOwner() { return mocks.isOwner.value; },
    activeCampaign: { user_id: "owner" },
  }),
}));
vi.mock("@/stores/auth", () => ({
  useAuthStore: () => ({ user: { get id() { return mocks.me.value; } } }),
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
  return mount(MembersTab, { global: { stubs: { EntityCombobox: EntityComboboxStub, CharacterApprovalQueue: true } } });
}

beforeEach(() => {
  mocks.mutate.mockReset();
  mocks.confirm.mockReset();
  mocks.setRole.mockReset();
  mocks.isOwner.value = true;
  mocks.me.value = "owner";
  mocks.rows.value = [member];
});

function labels(wrapper: ReturnType<typeof mountTab>) {
  return wrapper.findAll("button").map((b) => b.text());
}

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

  describe("co-DM controls (#590)", () => {
    it("labels the owner, a co-DM and a player, and lets the owner promote or demote", () => {
      mocks.rows.value = [ownerRow, coDmRow, member];
      const wrapper = mountTab();
      const text = wrapper.text();
      expect(text).toContain("Owner");
      expect(text).toContain("Co-DM");
      expect(text).toContain("Player");
      expect(text).toContain("Character: Mine, sitting out");
      const buttons = labels(wrapper);
      expect(buttons.filter((l) => l === "Make co-DM")).toHaveLength(1);
      expect(buttons.filter((l) => l === "Back to player")).toHaveLength(1);
      expect(buttons).not.toContain("Hand back the chair");
    });

    it("promotes through the role mutation", async () => {
      mocks.rows.value = [ownerRow, member];
      const wrapper = mountTab();
      await wrapper.findAll("button").find((b) => b.text() === "Make co-DM")!.trigger("click");
      expect(mocks.setRole).toHaveBeenCalledWith({ id: "m1", role: "dm" }, expect.anything());
    });

    it("gives a co-DM only the hand-back control, once confirmed", async () => {
      mocks.isOwner.value = false;
      mocks.me.value = "u2";
      mocks.confirm.mockResolvedValue(true);
      mocks.rows.value = [ownerRow, coDmRow, member];
      const wrapper = mountTab();
      const buttons = labels(wrapper);
      expect(buttons).not.toContain("Make co-DM");
      expect(buttons).not.toContain("Back to player");
      await wrapper.findAll("button").find((b) => b.text() === "Hand back the chair")!.trigger("click");
      await flushPromises();
      expect(mocks.setRole).toHaveBeenCalledWith({ id: "m2", role: "player" }, expect.anything());
    });

    it("shows a player no role controls", () => {
      mocks.isOwner.value = false;
      mocks.me.value = "u1";
      mocks.rows.value = [ownerRow, member];
      const buttons = labels(mountTab());
      expect(buttons).not.toContain("Make co-DM");
      expect(buttons).not.toContain("Hand back the chair");
    });
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import CharacterApprovalQueue from "./CharacterApprovalQueue.vue";
import type { CharacterContentReview } from "@/composables/party/useCharacterContentReviews";

const mocks = vi.hoisted(() => ({
  mutateAsync: vi.fn<(input: { reviewId: string; scope: string; seenUpdatedAt?: string }) => Promise<number>>(),
  invalidate: vi.fn(),
  removeAsync: vi.fn<(reviewId: string) => Promise<number>>(),
  confirm: vi.fn<(message: string, options?: object) => Promise<boolean>>(),
  success: vi.fn(),
  error: vi.fn(),
}));

const state = vi.hoisted(() => ({ reviews: [] as unknown[], party: [] as unknown[] }));

vi.mock("@/composables/party/useCharacterContentReviews", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useCampaignPendingContentReviews: () => ({ data: { value: state.reviews } }),
  useApproveCharacterContent: () => ({ mutateAsync: mocks.mutateAsync }),
  useRemoveMissingContent: () => ({ mutateAsync: mocks.removeAsync }),
  useCharacterContentItem: () => ({
    data: ref(null),
    isPending: ref(true),
    isError: ref(false),
    refetch: vi.fn(),
  }),
}));
vi.mock("@tanstack/vue-query", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidate }),
}));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: { value: state.party } }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, fromError: () => "failed" }),
}));

function review(over: Partial<CharacterContentReview>): CharacterContentReview {
  return {
    id: "r1",
    campaign_id: "c1",
    party_member_id: "p1",
    kind: "species",
    ref: "x",
    label: "Kenku",
    reason: "source",
    source_slug: "tob",
    source_title: "Tome of Beasts",
    status: "pending",
    decided_by: null,
    decided_at: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function mountQueue() {
  return mount(CharacterApprovalQueue, { global: { stubs: { CharacterContentItemDialog: true } } });
}

function buttonLabels(wrapper: ReturnType<typeof mountQueue>): string[] {
  return wrapper.findAll("button").map((button) => button.text());
}

beforeEach(() => {
  mocks.mutateAsync.mockReset().mockResolvedValue(1);
  mocks.removeAsync.mockReset().mockResolvedValue(1);
  mocks.confirm.mockReset();
  mocks.success.mockReset();
  mocks.error.mockReset();
  state.reviews = [];
  state.party = [{ id: "p1", name: "Robin" }, { id: "p2", name: "Sam" }];
});

describe("CharacterApprovalQueue", () => {
  it("renders nothing when nothing is pending", () => {
    expect(mountQueue().find("section").exists()).toBe(false);
  });

  it("groups flags by character and does not print undefined for an unresolved one", () => {
    state.reviews = [
      review({ id: "r1", party_member_id: "p1" }),
      review({ id: "r2", party_member_id: "p1", kind: "spell", label: "Fireball" }),
      review({ id: "r3", party_member_id: "gone", label: "Elsewhere" }),
    ];
    const wrapper = mountQueue();
    const groups = wrapper.findAll("[data-testid=approval-group]");
    expect(groups).toHaveLength(2);
    expect(groups[0].text()).toContain("Robin");
    expect(groups[0].findAll("[data-testid=approval-flag]")).toHaveLength(2);
    expect(groups[1].text()).toContain("A character at your table");
    expect(wrapper.text()).not.toContain("undefined");
  });

  it("offers the options each reason allows, with what each one does", () => {
    state.reviews = [
      review({ id: "a", reason: "source" }),
      review({ id: "b", reason: "blocked", label: "Wizard", kind: "class" }),
      review({ id: "c", reason: "homebrew", label: "Mine" }),
      review({ id: "d", reason: "foreign", label: "Content from another table" }),
      review({ id: "e", reason: "missing", label: "Gone" }),
    ];
    const flags = mountQueue().findAll("[data-testid=approval-flag]");
    const labels = (index: number) => flags[index].findAll("button").map((b) => b.text());
    expect(labels(0)).toEqual(["Allow for this character", "Enable Tome of Beasts"]);
    expect(flags[0].text()).toContain("Everyone at the table may use this book from now on.");
    expect(labels(1)).toEqual(["Allow for this character", "Unblock for the table"]);
    expect(labels(2)).toEqual(["Approve", "View"]);
    expect(labels(3)).toEqual([]);
    expect(flags[3].text()).toContain("cannot be approved here");
    expect(flags[3].text()).toContain("Only its player can change this.");
    expect(flags.filter((f) => f.text().includes("View"))).toHaveLength(1);
    expect(labels(4)).toEqual(["Remove from character"]);
    expect(flags[4].text()).toContain("It points at nothing.");
  });

  it("removes a missing choice without asking", async () => {
    state.reviews = [review({ reason: "missing", label: "Gone" })];
    mocks.removeAsync.mockResolvedValue(0);
    const wrapper = mountQueue();
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.removeAsync).toHaveBeenCalledWith("r1");
    expect(mocks.success).toHaveBeenCalledWith("Removed from Robin. Robin can now be made active.");
  });

  it("approves for one character without asking", async () => {
    state.reviews = [review({})];
    mocks.mutateAsync.mockResolvedValue(0);
    const wrapper = mountQueue();
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ reviewId: "r1", scope: "character" });
    expect(mocks.success).toHaveBeenCalledWith("Kenku is approved for Robin. Robin can now be made active.");
  });

  it("asks before changing the table, and does nothing when declined", async () => {
    state.reviews = [review({})];
    mocks.confirm.mockResolvedValue(false);
    const wrapper = mountQueue();
    await wrapper.findAll("button")[1].trigger("click");
    await flushPromises();
    expect(mocks.confirm).toHaveBeenCalledWith(
      expect.stringContaining("Tome of Beasts becomes available to everyone at this table"),
      expect.objectContaining({ confirmLabel: "Enable" }),
    );
    expect(mocks.mutateAsync).not.toHaveBeenCalled();

    mocks.confirm.mockResolvedValue(true);
    await wrapper.findAll("button")[1].trigger("click");
    await flushPromises();
    expect(mocks.mutateAsync).toHaveBeenCalledWith({ reviewId: "r1", scope: "table" });
  });

  it("reports a failure through the toast", async () => {
    state.reviews = [review({})];
    mocks.mutateAsync.mockRejectedValue(new Error("nope"));
    const wrapper = mountQueue();
    await wrapper.findAll("button")[0].trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("failed");
    expect(buttonLabels(wrapper)).toContain("Allow for this character");
  });

  it("tells the DM to look again when the player edited the content after it was opened", async () => {
    state.reviews = [review({ id: "h1", reason: "homebrew", label: "Mothfolk", source_slug: null, source_title: null })];
    mocks.mutateAsync.mockRejectedValueOnce({ code: "CR002", message: "changed" });
    const wrapper = mountQueue();
    const approve = wrapper.findAll("button").find((b) => b.text() === "Approve");
    await approve?.trigger("click");
    await flushPromises();
    expect(mocks.error).toHaveBeenCalledWith("Mothfolk was changed after you opened it. Look again before approving.");
    expect(mocks.invalidate).toHaveBeenCalledWith({ queryKey: ["character-content-reviews", "item"] });
    expect(mocks.success).not.toHaveBeenCalled();
  });
});

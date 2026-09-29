import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import FamilyRequests from "./FamilyRequests.vue";
import FamilyChildTables from "./FamilyChildTables.vue";
import type { FamilyCampaign, FamilyJoinRequest } from "@/composables/account/useFamilyCampaigns";

const mocks = vi.hoisted(() => ({
  confirm: vi.fn(),
  decide: vi.fn(),
  remove: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
  error: vi.fn(),
}));

vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, info: mocks.info, error: mocks.error }),
}));
vi.mock("@/composables/account/useFamilyCampaigns", async (orig) => ({
  ...(await orig<typeof import("@/composables/account/useFamilyCampaigns")>()),
  useDecideJoinRequest: () => ({ mutateAsync: mocks.decide }),
  useRemoveFromFamilyCampaign: () => ({ mutateAsync: mocks.remove }),
}));

const request = (over: Partial<FamilyJoinRequest> = {}): FamilyJoinRequest => ({
  requestId: "r1", campaignId: "c1", campaignName: "Ashen Vale", joinerUserId: "j", joinerName: "Jo",
  joinerIsYoungPlayer: false, childUserId: "k", kind: "child_joining", dmName: "Sam",
  waitingOnOtherParent: false, createdAt: "2026-09-29T10:00:00Z", ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("FamilyRequests", () => {
  it("renders nothing without requests", () => {
    expect(mount(FamilyRequests, { props: { requests: [] } }).find("section").exists()).toBe(false);
  });

  it("words a child joining a campaign", () => {
    const w = mount(FamilyRequests, { props: { requests: [request()] } });
    expect(w.text()).toContain("Jo wants to join Ashen Vale, run by Sam.");
  });

  it("words someone joining a child's campaign, and mentions a young joiner", () => {
    const w = mount(FamilyRequests, {
      props: { requests: [request({ kind: "joining_child_campaign", dmName: "Kit", joinerIsYoungPlayer: true })] },
    });
    expect(w.text()).toContain("Jo wants to join Kit's campaign Ashen Vale.");
    expect(w.text()).toContain("Jo is a young player too.");
  });

  it("shows the waiting line instead of buttons after a yes", () => {
    const w = mount(FamilyRequests, { props: { requests: [request({ waitingOnOtherParent: true })] } });
    expect(w.find("[data-testid=waiting]").text()).toBe("You said yes. Waiting for the other parent.");
    expect(w.text()).not.toContain("Approve");
    expect(w.text()).not.toContain("Decline");
  });

  it("approves without asking, then toasts the outcome", async () => {
    mocks.decide.mockResolvedValue("joined");
    const w = mount(FamilyRequests, { props: { requests: [request()] } });
    await w.findAll("button").find((b) => b.text().includes("Approve"))?.trigger("click");
    await flushPromises();
    expect(mocks.confirm).not.toHaveBeenCalled();
    expect(mocks.decide).toHaveBeenCalledWith({ requestId: "r1", approve: true });
    expect(mocks.success).toHaveBeenCalledWith("Jo can now join Ashen Vale.");
  });

  it("declines only after confirmation", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mount(FamilyRequests, { props: { requests: [request()] } });
    const decline = () => w.findAll("button").find((b) => b.text().includes("Decline"));
    await decline()?.trigger("click");
    await flushPromises();
    expect(mocks.decide).not.toHaveBeenCalled();

    mocks.confirm.mockResolvedValue(true);
    mocks.decide.mockResolvedValue("declined");
    await decline()?.trigger("click");
    await flushPromises();
    expect(mocks.decide).toHaveBeenCalledWith({ requestId: "r1", approve: false });
    expect(mocks.info).toHaveBeenCalledWith("Request declined.");
  });
});

const table = (over: Partial<FamilyCampaign> = {}): FamilyCampaign => ({
  campaignId: "c1", name: "Ashen Vale", childRole: "player", childRunsIt: false,
  members: [
    { userId: "sam", displayName: "Sam", role: "dm", isOwner: true, isYoungPlayer: false, isYou: false },
    { userId: "k", displayName: "Kit", role: "player", isOwner: false, isYoungPlayer: true, isYou: false },
    { userId: "me", displayName: "Parent", role: "player", isOwner: false, isYoungPlayer: false, isYou: true },
  ],
  ...over,
});

describe("FamilyChildTables", () => {
  it("shows the empty state", () => {
    const w = mount(FamilyChildTables, { props: { childUserId: "k", campaigns: [] } });
    expect(w.text()).toContain("Not at any table yet.");
  });

  it("marks young players and you, and offers Remove for the child only at a table they don't run", () => {
    const w = mount(FamilyChildTables, { props: { childUserId: "k", campaigns: [table()] } });
    const rows = w.findAll("[data-testid=table-member]");
    expect(rows[1].text()).toContain("young player");
    expect(rows[2].text()).toContain("(you)");
    expect(rows[0].text()).not.toContain("Remove");
    expect(rows[1].text()).toContain("Remove");
    expect(rows[2].text()).not.toContain("Remove");
  });

  it("offers Remove for every non-owner at a table the child runs", () => {
    const w = mount(FamilyChildTables, { props: { childUserId: "k", campaigns: [table({ childRunsIt: true })] } });
    const rows = w.findAll("[data-testid=table-member]");
    expect(rows[0].text()).not.toContain("Remove");
    expect(rows[1].text()).toContain("Remove");
    expect(rows[2].text()).toContain("Remove");
  });

  it("removes after confirmation and toasts", async () => {
    mocks.confirm.mockResolvedValue(true);
    mocks.remove.mockResolvedValue(undefined);
    const w = mount(FamilyChildTables, { props: { childUserId: "k", campaigns: [table()] } });
    await w.findAll("[data-testid=table-member]")[1].find("button").trigger("click");
    await flushPromises();
    expect(mocks.remove).toHaveBeenCalledWith({ campaignId: "c1", userId: "k" });
    expect(mocks.success).toHaveBeenCalledWith("Kit was removed from Ashen Vale.");
  });
});

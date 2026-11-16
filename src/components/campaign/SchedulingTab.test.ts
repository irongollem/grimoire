// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount, flushPromises } from "@vue/test-utils";
import { ref } from "vue";
import SchedulingTab from "./SchedulingTab.vue";
import CadenceEditor from "./scheduling/CadenceEditor.vue";
import RegularEveningRow from "./scheduling/RegularEveningRow.vue";
import type { SessionAbsence, SessionCadence, SessionProposal } from "@/types/scheduling.types";

const m = vi.hoisted(() => ({
  createProposal: vi.fn(),
  deleteProposal: vi.fn(),
  saveCadence: vi.fn(),
  deleteCadence: vi.fn(),
  confirm: vi.fn(),
  announce: vi.fn(),
  notify: vi.fn(),
  feed: vi.fn(() => ""),
  download: vi.fn(),
}));

// 2026-11-16 is a Monday, so the next Thursday is the 19th.
const state = vi.hoisted(() => ({ cadence: null as unknown, proposals: [] as unknown[], absences: [] as unknown[] }));

vi.mock("@/composables/calendar/useScheduling", async () => {
  const { ref: r } = await import("vue");
  const mut = (fn: ReturnType<typeof vi.fn>) => () => ({ mutateAsync: fn, isPending: r(false) });
  return {
    useSessionProposals: () => ({ data: r(state.proposals) }),
    useAllSessionAvailability: () => ({ data: r([]) }),
    useSessionCadence: () => ({ data: r(state.cadence) }),
    useSessionAbsences: () => ({ data: r(state.absences) }),
    useCreateProposal: mut(m.createProposal),
    useUpdateProposal: mut(vi.fn()),
    useDeleteProposal: mut(m.deleteProposal),
    useSaveCadence: mut(m.saveCadence),
    useDeleteCadence: mut(m.deleteCadence),
  };
});
vi.mock("@/composables/campaign/useCampaigns", () => ({
  useCampaignById: () => ({ data: ref({ name: "Kind Country", ical_token: "tok" }) }),
  useRegenerateIcalToken: () => ({ mutateAsync: vi.fn(), isPending: ref(false) }),
}));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({
    data: ref([
      { id: "m1", user_id: "bram", role: "player", display_name: "Bram" },
      { id: "m2", user_id: "ada", role: "player", display_name: "Ada" },
    ]),
  }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1", isOwner: true }) }));
vi.mock("@/composables/campaign/useCampaignBroadcast", () => ({ sendCampaignAnnouncement: m.announce }));
vi.mock("@/composables/campaign/useEmailNotify", () => ({ notifyProposalCreated: m.notify }));
vi.mock("@/composables/calendar/useLocalToday", () => ({ useLocalToday: () => ref("2026-11-16") }));
vi.mock("@/composables/account/useChildAccount", () => ({ useChildAccount: () => ({ isChild: ref(false) }) }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: m.confirm }) }));
vi.mock("@/lib/downloadBlob", () => ({ downloadBlob: m.download }));
vi.mock("@edge-shared/ics.ts", () => ({ buildSessionFeed: m.feed }));

const cadence: SessionCadence = {
  id: "cad1",
  campaign_id: "c1",
  user_id: "u1",
  repeat: "weekly",
  every_weeks: 1,
  weekday: 4,
  week_of_month: null,
  start_time: "19:30:00",
  duration_minutes: 240,
  title: "Game night",
  starts_on: "2026-09-03",
  ends_on: null,
  created_at: "",
  updated_at: "",
};

function proposal(over: Partial<SessionProposal>): SessionProposal {
  return {
    id: "p1",
    campaign_id: "c1",
    user_id: "u1",
    proposed_date: "2026-11-21",
    proposed_time: "19:00",
    title: "Extra",
    notes: null,
    status: "proposed",
    min_attendance: 1,
    duration_minutes: 240,
    replaces_date: null,
    created_at: "",
    updated_at: "",
    ...over,
  };
}

function mountTab() {
  return mount(SchedulingTab, { global: { stubs: { VueDatePicker: true } } });
}

function button(w: ReturnType<typeof mountTab>, label: string) {
  const b = w.findAll("button").find((x) => x.text().includes(label));
  if (!b) throw new Error(`no button "${label}"`);
  return b;
}

beforeEach(() => {
  Object.values(m).forEach((f) => f.mockReset());
  m.createProposal.mockImplementation(async (p: Partial<SessionProposal>) => ({ id: "new1", title: "Game night", proposed_date: p.proposed_date, proposed_time: p.proposed_time }));
  m.feed.mockReturnValue("");
  state.cadence = cadence;
  state.proposals = [];
  state.absences = [];
});

describe("SchedulingTab regular evenings", () => {
  it("lists regular evenings as Regular and names who cannot make it", () => {
    state.absences = [{ user_id: "bram", absent_on: "2026-11-19" } as SessionAbsence];
    const w = mountTab();
    const rows = w.findAllComponents(RegularEveningRow);
    expect(rows[0].text()).toContain("Regular");
    expect(rows[0].text()).toContain("Bram can't make it");
    expect(rows[0].text()).toContain("1/2 available");
    // another evening's absence is not shown on the next one
    expect(rows[1].text()).not.toContain("Bram");
  });

  it("moving proposes the new date with replaces_date and emails the table", async () => {
    const w = mountTab();
    await w.findAllComponents(RegularEveningRow)[0].vm.$emit("move", new Date(2026, 10, 20, 18, 0));
    await flushPromises();
    expect(m.createProposal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "proposed", replaces_date: "2026-11-19", proposed_date: "2026-11-20", proposed_time: "18:00", title: "Game night" }),
    );
    expect(m.notify).toHaveBeenCalledWith("new1");
    expect(m.announce).toHaveBeenCalledTimes(1);
  });

  it("cancelling an evening creates a cancelled row and sends no email", async () => {
    m.confirm.mockResolvedValue(true);
    const w = mountTab();
    await w.findAllComponents(RegularEveningRow)[0].vm.$emit("cancel");
    await flushPromises();
    expect(m.createProposal).toHaveBeenCalledWith(
      expect.objectContaining({ status: "cancelled", proposed_date: "2026-11-19", replaces_date: "2026-11-19" }),
    );
    expect(m.announce).toHaveBeenCalledWith("c1", expect.stringContaining("No session on"));
    expect(m.notify).not.toHaveBeenCalled();
  });

  it("a declined confirm cancels nothing", async () => {
    m.confirm.mockResolvedValue(false);
    const w = mountTab();
    await w.findAllComponents(RegularEveningRow)[0].vm.$emit("cancel");
    await flushPromises();
    expect(m.createProposal).not.toHaveBeenCalled();
    expect(m.announce).not.toHaveBeenCalled();
  });

  it("a cancelled evening drops out of the upcoming list", () => {
    state.proposals = [proposal({ id: "x", status: "cancelled", proposed_date: "2026-11-19", replaces_date: "2026-11-19" })];
    const w = mountTab();
    expect(w.findAllComponents(RegularEveningRow)[0].text()).toContain("Nov 26");
  });

  it("a moved evening says where it moved from, and its remove keeps the regular evening", () => {
    state.proposals = [proposal({ replaces_date: "2026-11-19", proposed_date: "2026-11-20" })];
    const w = mountTab();
    expect(w.text()).toContain("Moved from");
    expect(w.find('button[aria-label="Remove this move and keep the regular evening"]').exists()).toBe(true);
  });
});

describe("SchedulingTab cancelled list", () => {
  it("Restore deletes the deviation row so the regular evening returns", async () => {
    state.proposals = [proposal({ id: "gone", status: "cancelled", proposed_date: "2026-11-19", replaces_date: "2026-11-19" })];
    const w = mountTab();
    await button(w, "Restore").trigger("click");
    expect(m.deleteProposal).toHaveBeenCalledWith("gone");
  });

  it("a plain cancelled session offers Delete, not Restore", () => {
    state.proposals = [proposal({ status: "cancelled" })];
    const w = mountTab();
    expect(w.findAll("button").some((b) => b.text().includes("Restore"))).toBe(false);
    expect(w.find('button[aria-label="Delete"]').exists()).toBe(true);
  });
});

describe("SchedulingTab cadence", () => {
  it("saves through the hook with the campaign and the existing row id", async () => {
    const w = mountTab();
    w.findComponent(CadenceEditor).vm.$emit("save", { title: "x" });
    await flushPromises();
    expect(m.saveCadence).toHaveBeenCalledWith({ campaignId: "c1", existingId: "cad1", input: { title: "x" } });
  });

  it("the first cadence is created without an existing id", async () => {
    state.cadence = null;
    const w = mountTab();
    w.findComponent(CadenceEditor).vm.$emit("save", { title: "x" });
    await flushPromises();
    expect(m.saveCadence).toHaveBeenCalledWith(expect.objectContaining({ existingId: null }));
  });
});

describe("SchedulingTab download", () => {
  it("passes the series, with every replaced evening excluded, so the file matches the feed", async () => {
    state.proposals = [
      proposal({ id: "a", replaces_date: "2026-11-19", proposed_date: "2026-11-20" }),
      proposal({ id: "b", status: "cancelled", proposed_date: "2026-11-26", replaces_date: "2026-11-26" }),
    ];
    const w = mountTab();
    await button(w, "Download .ics").trigger("click");
    const args = m.feed.mock.calls[0] as unknown as [{ series: { id: string; exdates: string[]; time: string } | null }];
    expect(args[0].series).toMatchObject({ id: "cad1", time: "19:30:00", exdates: ["2026-11-19", "2026-11-26"] });
  });

  it("without a cadence there is no series", async () => {
    state.cadence = null;
    const w = mountTab();
    await button(w, "Download .ics").trigger("click");
    const args = m.feed.mock.calls[0] as unknown as [{ series: unknown }];
    expect(args[0].series).toBeNull();
  });
});

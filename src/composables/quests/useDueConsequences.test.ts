import { describe, it, expect, beforeEach, vi } from "vitest";
import { effectScope, reactive, ref } from "vue";
import { flushPromises } from "@vue/test-utils";
import type { CalendarAdapter } from "@/types/calendar.types";
import type { PendingConsequenceEvent } from "@/lib/quests/dueConsequences";

/**
 * The composable's contract: a pending delayed consequence fires the moment
 * the campaign's own in-world "today" reaches its date — however "today" got
 * there. #794's whole point is that this no longer depends on which writer
 * moved it (`CalendarView`'s "Set Today", or `DetailsTab`'s "Current Year"
 * field) — only on the campaign store's own today fields changing.
 */

const activeCampaignId = ref<string | null>("campaign-1");
const todayYear = ref(1495);
const todayMonth = ref(3);
const todayDay = ref(10);

const TEST_ADAPTER: CalendarAdapter = {
  id: "test",
  name: "Test",
  epochName: "TE",
  defaultYear: 1490,
  months: Array.from({ length: 12 }, (_unused, i) => ({ num: i + 1, name: `Month ${i + 1}`, days: 30 })),
  intercalaryDays: [],
  weekSize: 10,
  isLeapYear: () => false,
  formatDate: () => "",
};

vi.mock("@/stores/campaign", () => ({
  useCampaignStore: () => reactive({
    get activeCampaignId() { return activeCampaignId.value; },
    get todayYear() { return todayYear.value; },
    get todayMonth() { return todayMonth.value; },
    get todayDay() { return todayDay.value; },
  }),
}));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => reactive({ adapter: TEST_ADAPTER }) }));

const pending = ref<PendingConsequenceEvent[] | undefined>(undefined);
const invalidateQueries = vi.fn();
vi.mock("@tanstack/vue-query", () => ({
  useQuery: () => ({ data: pending }),
  useQueryClient: () => ({ invalidateQueries }),
}));

const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
vi.mock("@/lib/supabase", () => ({ supabase: { rpc } }));

function event(overrides: Partial<PendingConsequenceEvent> & { id: string }): PendingConsequenceEvent {
  return {
    after_days: 1,
    fires_on_year: todayYear.value,
    fires_on_month: todayMonth.value,
    fires_on_day: todayDay.value,
    ...overrides,
  };
}

// `pending`/`campaign.today*` are module-level refs shared by every test, so a
// watcher from a previous test left running would keep reacting to the next
// test's `pending.value` assignment and inflate its call count — hence
// tracking and stopping the previous scope before each new mount.
let activeScope: ReturnType<typeof effectScope> | null = null;

async function mount() {
  activeScope?.stop();
  const mod = await import("@/composables/quests/useDueConsequences");
  const scope = effectScope();
  scope.run(() => mod.useDueConsequences());
  activeScope = scope;
  await flushPromises();
  return scope;
}

beforeEach(() => {
  vi.resetModules();
  activeCampaignId.value = "campaign-1";
  todayYear.value = 1495;
  todayMonth.value = 3;
  todayDay.value = 10;
  pending.value = undefined;
  invalidateQueries.mockClear();
  rpc.mockClear();
});

describe("useDueConsequences", () => {
  it("does nothing while the pending query has not loaded", async () => {
    await mount();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does nothing when there are no pending events", async () => {
    pending.value = [];
    await mount();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("leaves a pending event alone until its date arrives", async () => {
    pending.value = [event({ id: "e1", fires_on_day: 10, after_days: 5 })]; // due day 15
    await mount();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("performs a pending event the moment its date has arrived", async () => {
    pending.value = [event({ id: "e1", fires_on_day: 8, after_days: 2 })]; // due day 10 = today
    await mount();

    expect(rpc).toHaveBeenCalledWith("perform_quest_consequence", {
      p_event_id: "e1",
      p_year: 1495,
      p_month: 3,
      p_day: 10,
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["quest_consequence_events"] });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ["calendar-events"] });
  });

  it("performs an already-overdue event on mount, not just one due exactly today", async () => {
    pending.value = [event({ id: "e1", fires_on_day: 1, after_days: 1 })]; // due day 2, long past
    await mount();
    expect(rpc).toHaveBeenCalledWith("perform_quest_consequence", expect.objectContaining({ p_event_id: "e1" }));
  });

  it("fires a previously-not-due event once the campaign's today advances past it", async () => {
    pending.value = [event({ id: "e1", fires_on_day: 10, after_days: 5 })]; // due day 15
    await mount();
    expect(rpc).not.toHaveBeenCalled();

    todayDay.value = 15;
    await flushPromises();

    expect(rpc).toHaveBeenCalledWith("perform_quest_consequence", expect.objectContaining({ p_event_id: "e1", p_day: 15 }));
  });

  it("performs every due event, not just the first", async () => {
    pending.value = [
      event({ id: "e1", fires_on_day: 8, after_days: 0 }),
      event({ id: "e2", fires_on_day: 9, after_days: 1 }),
    ];
    await mount();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc).toHaveBeenCalledWith("perform_quest_consequence", expect.objectContaining({ p_event_id: "e1" }));
    expect(rpc).toHaveBeenCalledWith("perform_quest_consequence", expect.objectContaining({ p_event_id: "e2" }));
  });

  it("does nothing without an active campaign", async () => {
    activeCampaignId.value = null;
    pending.value = [event({ id: "e1", fires_on_day: 1, after_days: 0 })];
    await mount();
    expect(rpc).not.toHaveBeenCalled();
  });
});

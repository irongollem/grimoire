import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import type { CanonForceStep } from "@/types/canon.types";
import { canonEntry } from "@/test/canonEntry";

const today = vi.hoisted(() => ({ current: { year: 512, month: 3, day: 4 } as { year: number; month: number; day: number } | null }));
vi.mock("@/composables/canon/useWorldToday", () => ({ useWorldToday: () => ({ get value() { return today.current; } }) }));
vi.mock("@/stores/calendar", () => ({ useCalendarStore: () => ({ adapter: { formatDate: (y: number) => `year ${y}` } }) }));

import ForceRow from "./ForceRow.vue";

const step = (over: Partial<CanonForceStep>): CanonForceStep => ({
  id: "s", user_id: "u", campaign_id: "c1", force_id: "f1", title: "The ferry stops", sort_order: 0, reached_at: null, reached_session_id: null,
  due_year: 500, due_month: null, due_day: null, ai_provenance: null, created_at: "x", updated_at: "x", ...over,
});
const mountIt = (entry = canonEntry({ id: "f1", part: "force", title: "The Ferrymen" }), steps = [step({})]) =>
  mount(ForceRow, { props: { entry, steps, ticks: [] }, global: { stubs: { CanonLedgerRow: { template: "<div><slot /></div>" }, ForceClock: true, CanonMoveButtons: true } } });

describe("ForceRow", () => {
  // Bug caught (#1258 item 9): a force with a step past its due date looking on schedule in the list.
  it("says a step is due and not reached when the campaign's date has passed it", () => {
    expect(mountIt().get("[data-testid=force-overdue]").text()).toBe("Due year 500, not reached.");
  });

  // Bug caught: the warning shown while the step is not yet due.
  it("says nothing before the due date", () => {
    today.current = { year: 400, month: 1, day: 1 };
    expect(mountIt().find("[data-testid=force-overdue]").exists()).toBe(false);
    today.current = { year: 512, month: 3, day: 4 };
  });

  // Bug caught: an ended force still reporting steps it will never reach as late.
  it("says nothing for a force that has ended", () => {
    const ended = canonEntry({ id: "f1", part: "force", closed_as: "stopped", closed_at: "2026-11-02T10:00:00Z" });
    expect(mountIt(ended).find("[data-testid=force-overdue]").exists()).toBe(false);
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const { fake, state } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), state: { preview: false } };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "me" }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ dmPreviewMode: state.preview }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "me" } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/calendar/useLocalToday", () => ({ useLocalToday: () => ref("2026-11-17") }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({
  useCampaignMembers: () => ({
    data: ref([{ role: "player" }, { role: "player" }, { role: "player" }, { role: "player" }, { role: "player" }]),
  }),
}));

import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import HearthNextSession from "./HearthNextSession.vue";

// 2026-11-19 is the Thursday after "today".
const CADENCE = {
  id: "k1",
  campaign_id: "c1",
  user_id: "dm",
  repeat: "weekly",
  every_weeks: 1,
  weekday: 4,
  week_of_month: null,
  start_time: "19:30:00",
  duration_minutes: 240,
  title: "Thursday game",
  starts_on: "2026-11-01",
  ends_on: null,
};

async function mountCard() {
  const w = mount(HearthNextSession, {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] },
  });
  await flushPromises();
  await flushPromises();
  return w;
}
const pressed = (w: Awaited<ReturnType<typeof mountCard>>) =>
  w.findAll("button").find((b) => b.attributes("aria-pressed") === "true" || b.attributes("aria-checked") === "true");
const button = (w: Awaited<ReturnType<typeof mountCard>>, label: string) =>
  w.findAll("button").find((b) => b.text() === label)!;

beforeEach(() => {
  fake.reset();
  state.preview = false;
  fake.seed("session_cadences", [CADENCE]);
});

describe("HearthNextSession on a regular evening (#1213)", () => {
  it("says Regular and counts only the other players' absences against the tally", async () => {
    fake.seed("session_absences", [
      { id: "a1", campaign_id: "c1", user_id: "other", absent_on: "2026-11-19" },
      // A different evening must not count.
      { id: "a2", campaign_id: "c1", user_id: "x", absent_on: "2026-11-26" },
    ]);
    const w = await mountCard();
    expect(w.text()).toContain("Regular");
    expect(w.text()).toContain("4 of 5 coming, you too");
  });

  it("Can't make it writes my absence and no availability row", async () => {
    const w = await mountCard();
    await button(w, "Can't make it").trigger("click");
    await flushPromises();
    expect(fake.rows("session_absences")).toEqual([
      expect.objectContaining({ user_id: "me", absent_on: "2026-11-19", campaign_id: "c1" }),
    ]);
    expect(fake.rows("session_availability")).toEqual([]);
  });

  it("shows out only for my own absence, not another player's on the same evening", async () => {
    fake.seed("session_absences", [{ id: "a1", campaign_id: "c1", user_id: "other", absent_on: "2026-11-19" }]);
    const w = await mountCard();
    expect(pressed(w)?.text()).toBe("I'm in");
    fake.seed("session_absences", [{ id: "a2", campaign_id: "c1", user_id: "me", absent_on: "2026-11-19" }]);
    const again = await mountCard();
    expect(pressed(again)?.text()).toBe("Can't make it");
  });

  it("I'm in takes my absence back and leaves another player's", async () => {
    fake.seed("session_absences", [
      { id: "a1", campaign_id: "c1", user_id: "me", absent_on: "2026-11-19" },
      { id: "a2", campaign_id: "c1", user_id: "other", absent_on: "2026-11-19" },
    ]);
    const w = await mountCard();
    await button(w, "I'm in").trigger("click");
    await flushPromises();
    expect(fake.rows("session_absences").map((r) => r.id)).toEqual(["a2"]);
  });

  it("in DM preview the answer is disabled and nothing is written", async () => {
    state.preview = true;
    const w = await mountCard();
    for (const b of w.findAll("button")) expect(b.attributes("disabled")).toBeDefined();
    // A disabled button swallows the click; the handler must refuse on its own too.
    w.findComponent(SegmentedControl).vm.$emit("update:modelValue", "out");
    await flushPromises();
    expect(fake.rows("session_absences")).toEqual([]);
  });
});

describe("HearthNextSession on a proposed date", () => {
  it("answering writes session_availability, never an absence", async () => {
    fake.seed("session_cadences", []);
    fake.reset();
    fake.seed("session_proposals", [
      {
        id: "p1",
        campaign_id: "c1",
        status: "proposed",
        proposed_date: "2026-11-20",
        proposed_time: null,
        duration_minutes: 180,
        title: "Moved",
        notes: null,
        min_attendance: 2,
        replaces_date: null,
      },
    ]);
    const w = await mountCard();
    expect(w.text()).toContain("Proposed");
    await button(w, "Can't make it").trigger("click");
    await flushPromises();
    expect(fake.rows("session_availability")).toEqual([
      expect.objectContaining({ session_proposal_id: "p1", user_id: "me", available: false }),
    ]);
    expect(fake.rows("session_absences")).toEqual([]);
  });
});

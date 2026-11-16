import { beforeEach, describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { VueQueryPlugin, QueryClient } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "me" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

import { useSaveCadence, useSetAbsence } from "./useScheduling";

function run<T>(hook: () => T): T {
  let out!: T;
  mount(defineComponent({ setup() { out = hook(); return () => null; } }), {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
  return out;
}

beforeEach(() => fake.reset());

describe("useSetAbsence (#1213)", () => {
  beforeEach(() => {
    fake.seed("session_absences", [
      { id: "a1", campaign_id: "c1", user_id: "me", absent_on: "2026-11-19" },
      // Another player out the same evening, and me out another evening.
      { id: "a2", campaign_id: "c1", user_id: "other", absent_on: "2026-11-19" },
      { id: "a3", campaign_id: "c1", user_id: "me", absent_on: "2026-11-26" },
    ]);
  });

  it("taking back my absence removes only my row for that evening, not another player's", async () => {
    await run(useSetAbsence).mutateAsync({ campaignId: "c1", date: "2026-11-19", absent: false });
    expect(fake.rows("session_absences").map((r) => r.id)).toEqual(["a2", "a3"]);
  });
});

describe("useSaveCadence", () => {
  it("edits an existing cadence without restamping its author (a co-DM saving the owner's rhythm)", async () => {
    fake.seed("session_cadences", [{ id: "k1", campaign_id: "c1", user_id: "owner", weekday: 4 }]);
    await run(useSaveCadence).mutateAsync({
      campaignId: "c1",
      existingId: "k1",
      input: {
        repeat: "weekly",
        every_weeks: 1,
        weekday: 5,
        week_of_month: null,
        start_time: "19:30",
        duration_minutes: 240,
        title: "Session",
        starts_on: "2026-11-16",
        ends_on: null,
      },
    });
    expect(fake.rows("session_cadences")).toEqual([expect.objectContaining({ id: "k1", user_id: "owner", weekday: 5 })]);
  });
});

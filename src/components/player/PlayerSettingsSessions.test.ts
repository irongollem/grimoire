import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "me" }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: { id: "me" } }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/composables/calendar/useLocalToday", () => ({ useLocalToday: () => ref("2026-11-17") }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (_e: unknown, m: string) => m }) }));

import PlayerSettingsSessions from "./PlayerSettingsSessions.vue";

// Every Thursday; the next two after Tue 17 Nov 2026 are the 19th and 26th.
const CADENCE = {
  id: "k1", campaign_id: "c1", user_id: "dm", repeat: "weekly", every_weeks: 1, weekday: 4,
  week_of_month: null, start_time: "19:30:00", duration_minutes: 240, title: "Thursday game",
  starts_on: "2026-11-01", ends_on: null,
};

async function mountPage() {
  const w = mount(PlayerSettingsSessions, {
    global: {
      plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]],
      stubs: { SettingsSection: { template: "<section><slot /></section>" } },
    },
  });
  await flushPromises();
  await flushPromises();
  return w;
}

beforeEach(() => {
  fake.reset();
  fake.seed("session_cadences", [CADENCE]);
  fake.seed("session_absences", [
    { id: "a1", campaign_id: "c1", user_id: "me", absent_on: "2026-11-19" },
    // Another player out on the 26th must not read as my absence.
    { id: "a2", campaign_id: "c1", user_id: "other", absent_on: "2026-11-26" },
  ]);
});

describe("PlayerSettingsSessions on a cadence (#1213)", () => {
  it("pressing Can't make it on an evening I'm already out of takes the absence back", async () => {
    const w = await mountPage();
    const toggles = w.findAll("button").filter((b) => b.text().includes("Can't make it"));
    await toggles[0].trigger("click"); // the 19th, where I am out
    await flushPromises();
    expect(fake.rows("session_absences").map((r) => r.id)).toEqual(["a2"]);
  });

  it("on an evening only someone else is out of, it adds my absence instead of removing theirs", async () => {
    const w = await mountPage();
    const toggles = w.findAll("button").filter((b) => b.text().includes("Can't make it"));
    await toggles[1].trigger("click"); // the 26th
    await flushPromises();
    expect(fake.rows("session_absences")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "a2" }),
        expect.objectContaining({ user_id: "me", absent_on: "2026-11-26" }),
      ]),
    );
    expect(fake.rows("session_absences")).toHaveLength(3);
  });
});

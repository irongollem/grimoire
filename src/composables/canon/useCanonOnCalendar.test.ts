import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { canonEntry } from "@/test/canonEntry";

const h = vi.hoisted(() => ({
  options: [] as { enabled: { value: boolean } }[],
  auth: { isDM: true },
  campaign: { activeCampaignId: "c1" as string | null },
  steps: [] as unknown[],
}));

vi.mock("@tanstack/vue-query", () => ({
  useQuery: (opts: { enabled: { value: boolean }; queryKey: { value: readonly unknown[] } }) => {
    h.options.push(opts);
    const forces = opts.queryKey.value[1] === "forces";
    const data = forces
      ? { steps: h.steps, ticks: [{ id: "t1", force_id: "f1", delta: 1, note: "", world_year: 50, world_month: null, world_day: null }] }
      : [canonEntry({ id: "l1", part: "lore", title: "Old", world_year: 10 }), canonEntry({ id: "f1", part: "force", title: "Ferrymen" })];
    return { data: ref(data) };
  },
}));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => h.auth }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => h.campaign }));
vi.mock("@/composables/canon/useCanonForces", () => ({ fetchCanonForceData: vi.fn() }));

import { useCanonOnCalendar } from "./useCanonOnCalendar";
import { useAppUiStore } from "@/stores/ui/app";
import { useCalendarUiStore } from "@/stores/ui/calendar";

beforeEach(() => {
  setActivePinia(createPinia());
  h.options.length = 0;
  h.auth.isDM = true;
  h.campaign.activeCampaignId = "c1";
  h.steps = [];
});

describe("useCanonOnCalendar", () => {
  // Bug caught: the DM-only canon reads firing on a player's Calendar, and canon items reaching a player's timeline.
  it("neither enables the reads nor offers items for a player", () => {
    h.auth.isDM = false;
    const { items } = useCanonOnCalendar();
    expect(h.options.map((o) => o.enabled.value)).toEqual([false, false]);
    expect(items.value).toEqual([]);
  });

  // Bug caught: a DM previewing the player portal still shown (and querying) the canon.
  it("is off while the DM previews the player portal", () => {
    useAppUiStore().dmPreviewMode = true;
    const { items } = useCanonOnCalendar();
    expect(h.options.map((o) => o.enabled.value)).toEqual([false, false]);
    expect(items.value).toEqual([]);
  });

  // Bug caught: the DM's canon missing from the Calendar, and the "Show canon on the calendar" toggle doing nothing.
  it("offers dated lore and ticks to the DM, and the toggle hides them and stops the reads", () => {
    const { items } = useCanonOnCalendar();
    expect(items.value.map((i) => i.key)).toEqual(["lore:l1", "tick:t1"]);
    expect(h.options.map((o) => o.enabled.value)).toEqual([true, true]);
    useCalendarUiStore().showCanonOnCalendar = false;
    expect(items.value).toEqual([]);
    expect(h.options.map((o) => o.enabled.value)).toEqual([false, false]);
  });

  // Bug caught (#1279 item 32): a step put on the Calendar drawn twice, as its event and again as "A step due".
  it("leaves out a due step that points at its Calendar event, and keeps one that does not", () => {
    const step = (id: string, eventId: string | null) => ({ id, force_id: "f1", title: id, sort_order: 0, reached_at: null, due_year: 60, due_month: 2, due_day: 3, calendar_event_id: eventId });
    h.steps = [step("s1", "e1"), step("s2", null)];
    const keys = useCanonOnCalendar().items.value.map((i) => i.key);
    expect(keys).toContain("due:s2");
    expect(keys).not.toContain("due:s1");
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { effectScope, nextTick } from "vue";
import type { CellKey } from "@/types/dungeonMap.types";
import type { Campaign, ExploreParty } from "@/types/campaign.types";

const h = vi.hoisted(() => ({ write: vi.fn() }));
vi.mock("@/composables/campaign/useCampaigns", () => ({ useSetExploreParty: () => ({ mutate: h.write }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: vi.fn() }) }));

import { useCampaignStore } from "@/stores/campaign";
import { useExploreParty } from "./useExploreParty";

const member = (id: string) => ({ id, name: id, current_hp: 5, max_hp: 10, portrait_url: null, portrait_focal_point: null });
const ROOMS = new Map<string, CellKey[]>([["hall", ["0,0", "1,0", "2,0"]]]);

function campaignWith(explore: ExploreParty | null): Campaign {
  return { id: "c1", explore_party: explore } as Campaign;
}

function setup(stored: ExploreParty | null = null) {
  const store = useCampaignStore();
  store.activeCampaignId = "c1";
  store.activeCampaign = campaignWith(stored);
  const scope = effectScope();
  const api = scope.run(() =>
    useExploreParty({
      siteId: "s1",
      members: () => [member("a"), member("b")],
      roomCells: () => ROOMS,
      roomOrder: ["hall"],
      partyRoomId: () => null,
    }),
  )!;
  return { api, scope, store };
}

describe("useExploreParty", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    h.write.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  // #1125 decision 9: one write per move, however many characters it moved.
  it("writes a move of the whole party once, with everyone's new square", () => {
    const { api } = setup({ site_id: "s1", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    api.place({ a: { x: 5, y: 5 } });
    api.place({ b: { x: 6, y: 5 } });
    expect(h.write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(h.write.mock.calls[0][0]).toEqual({
      id: "c1",
      explore: { site_id: "s1", positions: { a: { x: 5, y: 5 }, b: { x: 6, y: 5 } } },
    });
  });

  // A drag or a run of clicks is one move: the write waits until the party has been still for a moment.
  it("keeps waiting while moves keep coming, and writes once they stop", () => {
    const { api } = setup({ site_id: "s1", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    api.place({ a: { x: 3, y: 3 } });
    vi.advanceTimersByTime(300);
    api.place({ a: { x: 4, y: 3 } });
    vi.advanceTimersByTime(300);
    expect(h.write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(h.write).toHaveBeenCalledTimes(1);
  });

  it("seats a party that has never explored this site at its entrance and records it", () => {
    const { api } = setup(null);
    expect(api.tokens.value.map((t) => t.position)).toEqual([{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    vi.advanceTimersByTime(500);
    expect(h.write).toHaveBeenCalledTimes(1);
  });

  it("does not move a party that already stands somewhere on this site", () => {
    const { api } = setup({ site_id: "s1", positions: { a: { x: 7, y: 7 }, b: { x: 8, y: 7 } } });
    vi.advanceTimersByTime(500);
    expect(api.tokens.value.map((t) => t.position)).toEqual([{ x: 7, y: 7 }, { x: 8, y: 7 }]);
    expect(h.write).not.toHaveBeenCalled();
  });

  it("re-seats a party whose saved squares belong to another site", () => {
    const { api } = setup({ site_id: "elsewhere", positions: { a: { x: 7, y: 7 }, b: { x: 8, y: 7 } } });
    expect(api.tokens.value[0].position).toEqual({ x: 0, y: 0 });
  });

  // A re-read landing between a move and its write would put the token back where it was.
  it("keeps an unsent move when the campaign row is re-read in the meantime", async () => {
    const { api, store } = setup({ site_id: "s1", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    api.place({ a: { x: 5, y: 5 } });
    store.activeCampaign = campaignWith({ site_id: "s1", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    await nextTick();
    expect(api.positions.value.a).toEqual({ x: 5, y: 5 });
  });

  it("writes a pending move when the screen is left", () => {
    const { api, scope } = setup({ site_id: "s1", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } });
    api.place({ a: { x: 5, y: 5 } });
    scope.stop();
    expect(h.write).toHaveBeenCalledTimes(1);
  });
});


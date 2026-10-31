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

function setup(
  stored: ExploreParty | null = null,
  sizeOf?: (id: string) => "large" | null,
  site: { roomCells?: ReadonlyMap<string, CellKey[]>; roomOrder?: string[]; frame?: { across: number; down: number } | null } = {},
) {
  const store = useCampaignStore();
  store.activeCampaignId = "c1";
  store.activeCampaign = campaignWith(stored);
  const scope = effectScope();
  const api = scope.run(() =>
    useExploreParty({
      siteId: "s1",
      members: () => [member("a"), member("b")],
      roomCells: () => site.roomCells ?? ROOMS,
      roomOrder: site.roomOrder ?? ["hall"],
      partyRoomId: () => null,
      frame: () => site.frame ?? null,
      ...(sizeOf ? { sizeOf } : {}),
    }),
  )!;
  return { api, scope, store };
}

describe("useExploreParty sizes", () => {
  beforeEach(() => setActivePinia(createPinia()));

  // Decision 13: every creature takes its size, a party member included.
  it("draws a Large character's token two squares wide", () => {
    const { api } = setup({ site_id: "s1", positions: { a: { x: 0, y: 0 }, b: { x: 1, y: 0 } } }, (id) => (id === "b" ? "large" : null));
    expect(api.tokens.value.map((t) => t.footprint)).toEqual([1, 2]);
  });
});

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

describe("useExploreParty on a site with no rooms", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    h.write.mockClear();
  });
  afterEach(() => vi.useRealTimers());

  const NO_ROOMS = { roomCells: new Map<string, CellKey[]>(), roomOrder: [] };

  // The Hollow Clearing bug: no traced room meant no square for anyone and explore_party stayed null.
  it("seats the party in the middle of the picture and writes explore_party once", () => {
    const { api } = setup(null, undefined, { ...NO_ROOMS, frame: { across: 40, down: 30 } });
    const squares = api.tokens.value.map((t) => t.position);
    expect(squares.every((p) => !!p && Math.abs(p.x - 20) <= 2 && Math.abs(p.y - 15) <= 2)).toBe(true);
    vi.advanceTimersByTime(500);
    expect(h.write).toHaveBeenCalledTimes(1);
    expect(Object.keys(h.write.mock.calls[0][0].explore.positions).sort()).toEqual(["a", "b"]);
  });

  it("waits, with nobody on the map, until the picture's size is known", async () => {
    const { api } = setup(null, undefined, { ...NO_ROOMS, frame: null });
    await nextTick();
    vi.advanceTimersByTime(500);
    expect(api.tokens.value.every((t) => t.position === undefined)).toBe(true);
    expect(h.write).not.toHaveBeenCalled();
  });

  it("seats the party at the middle when the entrance room has no squares on this frame", () => {
    const { api } = setup(null, undefined, { roomCells: new Map([["hall", []]]), roomOrder: ["hall"], frame: { across: 40, down: 30 } });
    expect(api.tokens.value.every((t) => t.position !== undefined)).toBe(true);
  });

  // A click on a bare square with unplaced characters picked used to do nothing at all.
  it("seatAt stands only the unplaced characters at the clicked square, leaving a placed one where it is", () => {
    const { api } = setup({ site_id: "s1", positions: { a: { x: 2, y: 2 } } }, undefined, { ...NO_ROOMS, frame: null });
    api.seatAt(["a", "b"], { x: 9, y: 9 });
    const [a, b] = api.tokens.value.map((t) => t.position);
    expect(a).toEqual({ x: 2, y: 2 });
    expect(b).toEqual({ x: 9, y: 9 });
    vi.advanceTimersByTime(500);
    expect(h.write).toHaveBeenCalledTimes(1);
  });
});

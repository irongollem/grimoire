// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { effectScope, ref } from "vue";

const h = vi.hoisted(() => ({
  campaign: { activeCampaign: { id: "c1" } as { id: string } | null },
  setOccluders: vi.fn(),
  memoryArgs: [] as unknown[],
  doorArgs: [] as unknown[],
  sightOpts: null as null | { grid: unknown; onlyInstanceId: unknown; doorStates: unknown; zones: unknown; tokens: unknown },
  rememberEnabled: null as null | (() => boolean),
}));

vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => h.campaign }));
vi.mock("@/stores/encounterRun", () => ({ useEncounterRunStore: () => ({ setOccluders: h.setOccluders }) }));
vi.mock("@/composables/locations/useMapMemory", () => ({
  useMapMemory: (...args: unknown[]) => {
    h.memoryArgs = args;
    return { memory: ref(new Set<string>()), isLoading: ref(false) };
  },
}));
vi.mock("@/composables/locations/useMapDoors", () => ({
  useMapDoors: (...args: unknown[]) => {
    h.doorArgs = args;
    return { doorStates: ref([{ id: "d1", open: true }]), setDoor: vi.fn() };
  },
}));
vi.mock("@/composables/encounters/usePartySight", () => ({
  usePartySight: (opts: NonNullable<typeof h.sightOpts>) => {
    h.sightOpts = opts;
    return { viewers: ref([]), sight: ref(new Set<string>()) };
  },
}));
vi.mock("@/composables/locations/useRememberSight", () => ({
  useRememberSight: (opts: { enabled: () => boolean }) => {
    h.rememberEnabled = opts.enabled;
  },
}));
vi.mock("@/lib/battlemap/occlusion", () => ({
  occludersOf: (live: { id: string }, doors: unknown) => ({ from: live.id, doors, segments: [], solid: new Set() }),
}));

import { useFightMapSight } from "./useFightMapSight";

type Surface = Parameters<typeof useFightMapSight>[0]["surface"];
const surfaceOf = (live: unknown, placeId = "p1") =>
  ({ mapLocation: { id: placeId }, calibration: { cells_per_image_width: 10 }, live }) as unknown as Surface;

function setup(over: { surface?: Surface; mayRemember?: boolean; size?: { w: number; h: number } | null } = {}) {
  const scope = effectScope();
  const api = scope.run(() =>
    useFightMapSight({
      surface: over.surface ?? surfaceOf({ id: "live1" }),
      imageSize: () => (over.size === undefined ? { w: 1000, h: 500 } : over.size),
      zones: [],
      tokens: [],
      onlyInstanceId: "pc1",
      mayRemember: over.mayRemember ?? true,
    }),
  );
  if (!api) throw new Error("setup failed");
  return { api, scope };
}

beforeEach(() => {
  h.campaign.activeCampaign = { id: "c1" };
  h.setOccluders.mockClear();
  h.sightOpts = null;
  h.rememberEnabled = null;
});

describe("useFightMapSight", () => {
  it("never remembers when the window may not write, even with a campaign and a place", () => {
    setup({ mayRemember: false });
    expect(h.rememberEnabled?.()).toBe(false);
  });

  it("remembers only once the campaign and the place are both known", () => {
    setup();
    expect(h.rememberEnabled?.()).toBe(true);
    h.campaign.activeCampaign = null;
    expect(h.rememberEnabled?.()).toBe(false);
    h.campaign.activeCampaign = { id: "c1" };
    setup({ surface: ref(null) as unknown as Surface });
    expect(h.rememberEnabled?.()).toBe(false);
  });

  it("scopes the memory and the doors to this campaign and this place", () => {
    setup();
    const [cid, pid] = h.memoryArgs as [() => string | null, () => string | null];
    expect([cid(), pid()]).toEqual(["c1", "p1"]);
    const [dcid, dpid] = h.doorArgs as [() => string | null, () => string | null];
    expect([dcid(), dpid()]).toEqual(["c1", "p1"]);
  });

  it("has no grid until the picture's size is known", () => {
    expect(setup({ size: null }).api.grid.value).toBeNull();
    expect(setup().api.grid.value).not.toBeNull();
  });

  it("hands the sight only the doors as the party left them and the chosen viewer", () => {
    const { api } = setup();
    expect(h.sightOpts?.doorStates).toBe(api.doorStates);
    expect(h.sightOpts?.onlyInstanceId).toBe("pc1");
  });

  it("has no occluders without a drawn live map, and reads the doors with one", () => {
    expect(setup({ surface: surfaceOf(null) }).api.occluders.value).toBeNull();
    const { api } = setup();
    expect(api.occluders.value).toMatchObject({ from: "live1", doors: [{ id: "d1", open: true }] });
  });

  it("registers the walls with the run store and takes them back when its scope ends", () => {
    const { api, scope } = setup();
    const read = h.setOccluders.mock.calls[0][0] as () => unknown;
    expect(read()).toBe(api.occluders.value);
    scope.stop();
    expect(h.setOccluders).toHaveBeenLastCalledWith(null);
  });
});

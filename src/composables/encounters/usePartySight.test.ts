import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";

const sensesFor = vi.hoisted(() => ({ fn: (_id: string | null | undefined): { darkvision: number } | null => null }));
vi.mock("@/composables/party/usePartySenses", async () => {
  const { computed } = await import("vue");
  return { usePartySenses: () => computed(() => (id: string | null | undefined) => sensesFor.fn(id)) };
});
const sightSpy = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/battlemap/partySight", async (importActual) => {
  const actual = await importActual<typeof import("@/lib/battlemap/partySight")>();
  return {
    ...actual,
    sightCells: (...args: Parameters<typeof actual.sightCells>) => {
      sightSpy.calls++;
      return actual.sightCells(...args);
    },
  };
});

import { usePartySight, type SightToken } from "./usePartySight";

const pc = (id: string, x: number, y: number): SightToken => ({ instance_id: id, type: "player", position: { x, y }, party_member_id: id });
const monster = (id: string, x: number, y: number): SightToken => ({ instance_id: id, type: "monster", position: { x, y } });

function setup(tokens: SightToken[], onlyInstanceId: string | null = null) {
  const t = ref(tokens);
  const only = ref(onlyInstanceId);
  const grid = ref<{ cols: number; rows: number } | null>({ cols: 6, rows: 6 });
  const api = usePartySight({ live: null, doorStates: [], zones: [], tokens: t, grid, onlyInstanceId: only });
  return { api, t, only, grid };
}

describe("usePartySight", () => {
  it("does not recompute sight when a monster moves", () => {
    const { api, t } = setup([pc("a", 1, 1), monster("m", 4, 4)]);
    void api.sight.value;
    const before = sightSpy.calls;
    t.value = [pc("a", 1, 1), monster("m", 5, 5)];
    void api.sight.value;
    expect(sightSpy.calls).toBe(before);
  });

  it("recomputes when a player character moves", () => {
    const { api, t } = setup([pc("a", 1, 1)]);
    void api.sight.value;
    const before = sightSpy.calls;
    t.value = [pc("a", 2, 1)];
    void api.sight.value;
    expect(sightSpy.calls).toBe(before + 1);
  });

  it("looks only through the named token when onlyInstanceId is set", () => {
    const { api, only } = setup([pc("a", 1, 1), pc("b", 4, 4)]);
    expect(api.viewers.value).toHaveLength(2);
    only.value = "b";
    expect(api.viewers.value).toHaveLength(1);
    expect(api.viewers.value[0].x).toBeGreaterThan(3);
  });

  it("recomputes viewers when senses change", () => {
    sensesFor.fn = () => null;
    const { api } = setup([pc("a", 1, 1)]);
    expect(api.viewers.value[0].darkvisionFeet).toBe(0);
  });

  it("gives an empty set without a grid", () => {
    const { api, grid } = setup([pc("a", 1, 1)]);
    grid.value = null;
    expect(api.sight.value.size).toBe(0);
  });
});

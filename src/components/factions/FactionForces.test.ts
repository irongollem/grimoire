import { beforeEach, describe, expect, it, vi } from "vitest";
import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import { canonEntry } from "@/test/canonEntry";
import type { Connection } from "@/types/connections.types";
import type { CanonForceTick } from "@/types/canon.types";

const mocks = vi.hoisted(() => ({ connections: vi.fn(), entries: vi.fn(), forces: vi.fn() }));
const session = vi.hoisted(() => ({ isDM: true, preview: false }));
const state = vi.hoisted(() => ({ connections: [] as unknown[], entries: [] as unknown[], ticks: [] as unknown[] }));

vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ get isDM() { return session.isDM; } }) }));
vi.mock("@/stores/ui/app", () => ({ useAppUiStore: () => ({ get dmPreviewMode() { return session.preview; } }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useConnections: () => { mocks.connections(); return { data: computed(() => state.connections) }; } }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCanonEntries: () => { mocks.entries(); return { data: computed(() => state.entries) }; } }));
vi.mock("@/composables/canon/useCanonForces", async (orig) => ({
  ...(await orig<typeof import("@/composables/canon/useCanonForces")>()),
  useCanonForceData: () => { mocks.forces(); return { data: ref({ steps: [], ticks: state.ticks, quests: [] }) }; },
}));

import FactionForces from "./FactionForces.vue";
import { factionForces } from "./forcesAboutFaction";

const about = (other_id: string, over: Partial<Connection> = {}) => ({ source: "link", row_id: `r${other_id}`, type: "about", outward: false, other_kind: "canon", other_id, other_name: "x", ...over }) as Connection;
const tick = (force_id: string): CanonForceTick => ({ id: `t${Math.random()}`, force_id, delta: 1 }) as CanonForceTick;

const entries = [
  canonEntry({ id: "f1", part: "force", title: "The Ferrymen", wants: "the river to themselves", clock_size: 6 }),
  canonEntry({ id: "f2", part: "force", title: "The Gilded", wants: "tolls" }),
  canonEntry({ id: "f3", part: "force", title: "The Hush", wants: "", clock_size: 4, closed_as: "faded", closed_at: "2026-11-01T00:00:00Z" }),
  canonEntry({ id: "t1", part: "truth", title: "The bridge was never built by them" }),
];

describe("factionForces", () => {
  // Bug caught: a truth or secret about the faction (also an `about` link) listed as something it is moving, or a force about another faction.
  it("lists only forces about this faction", () => {
    const rows = factionForces([about("f1"), about("t1")], entries, []);
    expect(rows.map((r) => r.entryId)).toEqual(["f1"]);
  });

  it("gives the wants line and the clock", () => {
    expect(factionForces([about("f1")], entries, [tick("f1"), tick("f1"), tick("f2")])[0]).toMatchObject({ wants: "the river to themselves", status: "2 of 6" });
  });

  // Bug caught: an ended force still showing its clock as though it were moving.
  it("says how an ended force ended instead of its clock", () => {
    expect(factionForces([about("f3")], entries, [])[0]).toMatchObject({ status: "Ended: it faded away", wants: null });
  });

  it("says nothing of a clock a force does not have", () => {
    expect(factionForces([about("f2")], entries, [])[0]!.status).toBeNull();
  });

  // Bug caught: a tie of another type (known_to, related_to) counted as the force being about the faction.
  it("counts only about ties", () => {
    expect(factionForces([about("f1", { type: "related_to" })], entries, [])).toEqual([]);
  });
});

describe("FactionForces", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    Object.assign(session, { isDM: true, preview: false });
    Object.assign(state, { connections: [about("f1")], entries, ticks: [] });
  });
  const mountIt = () => mount(FactionForces, { props: { factionId: "fa1" }, global: { stubs: { RouterLink: { props: ["to"], template: "<a :href=\"typeof to === 'string' ? to : to.query.entry\"><slot /></a>" } } } });

  it("lists the forces with a link to each entry", () => {
    const w = mountIt();
    expect(w.findAll("[data-testid=faction-force]")).toHaveLength(1);
    expect(w.get("a").attributes("href")).toBe("f1");
  });

  it("offers to name a force when there are none", () => {
    state.connections = [];
    const w = mountIt();
    expect(w.find("[data-testid=faction-force]").exists()).toBe(false);
    expect(w.get("[data-testid=name-a-force]").attributes("href")).toBe("/canon");
  });

  // Bug caught: the DM-only canon reads running (and the block drawing) for a player, or a DM previewing the player portal.
  it.each([
    ["a player", { isDM: false, preview: false }],
    ["a DM previewing the player portal", { isDM: true, preview: true }],
  ])("mounts nothing and runs no read for %s", (_who, next) => {
    Object.assign(session, next);
    const w = mountIt();
    expect(w.find("[data-testid=faction-forces]").exists()).toBe(false);
    for (const read of Object.values(mocks)) expect(read).not.toHaveBeenCalled();
  });
});

// The one list of Zoning (Map Table frames 18-19).
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ZoningList from "./ZoningList.vue";
import type { DerivedSpace } from "@/cartographer/structure.types";
import type { ZoningEntry } from "@/lib/locations/foundRooms";
import type { BindableSpace, LocationMapRegion } from "@/types/locationMapRegion.types";
import type { QuestConsequence } from "@/types/quest.types";

const mocks = vi.hoisted(() => ({
  remove: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  roomRules: [] as QuestConsequence[],
}));

vi.mock("@/composables/locations/useLocationMapRegions", () => ({
  dmEdit: (patch: Record<string, unknown>) => ({ ...patch, derived_from: "dm" }),
  useUpdateLocationMapRegion: () => ({ mutate: mocks.update, mutateAsync: mocks.update }),
  useDeleteLocationMapRegion: () => ({ mutateAsync: mocks.remove }),
}));
vi.mock("@/composables/quests/useQuestFlow", () => ({
  useQuestConsequencesByLocations: () => ({ data: { get value() { return mocks.roomRules; } } }),
}));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({ useToast: () => ({ error: vi.fn(), fromError: (e: unknown) => String(e) }) }));

const stubs = {
  RouterLink: { template: "<a><slot /></a>" },
  EntityCombobox: true,
  SiteMapRoomRules: true,
  ZoneDetailsEditor: true,
};

const walls = (key: string, name: string | null = null): DerivedSpace => ({ key, cells: ["0,0"], signature: `sig-${key}`, name, nameSource: null });

function region(over: Partial<LocationMapRegion> = {}): LocationMapRegion {
  return {
    id: "r1", user_id: "u", site_location_id: "site-1", space_location_id: null, cells: ["0,0"], label: null, sort_order: null,
    region_role: "space", zone_kind: null, zone_payload: {}, derived_from: "dm", cell_signature: null, vertices: null,
    created_at: "", updated_at: "", ...over,
  };
}
const rowEntry = (over: Partial<LocationMapRegion>): ZoningEntry => ({ kind: "region", region: region(over), space: null, found: false, changed: false });
const foundEntry = (key: string, name: string | null = null): ZoningEntry => ({ kind: "found", space: walls(key, name) });
const place = (over: Partial<BindableSpace> = {}): BindableSpace => ({ id: "room-1", name: "The Reliquary", location_type: "room", ...over });

function mountList(props: Partial<InstanceType<typeof ZoningList>["$props"]> = {}) {
  return mount(ZoningList, {
    props: { entries: [], spaces: [place()], activeRegionId: null, foundCount: 0, hasDrawing: true, ...props },
    global: { stubs },
  });
}
const button = (w: ReturnType<typeof mountList>, label: string) =>
  w.findAllComponents({ name: "AppButton" }).find((b) => b.props("label") === label);

describe("ZoningList", () => {
  beforeEach(() => {
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.update.mockReset();
    mocks.confirm.mockReset().mockResolvedValue(true);
    mocks.roomRules = [];
  });

  it("lists a found room that has no row, marked found, without anything having been published", () => {
    const w = mountList({ entries: [foundEntry("s:0,0")], foundCount: 1 });
    expect(w.text()).toContain("1 room found from the walls");
    expect(w.find('[data-entry="found:s:0,0"]').text()).toContain("found");
  });

  it("an unnamed found room reads Room 3 by its place among the rooms, with a Name it action", () => {
    const w = mountList({ entries: [foundEntry("a"), foundEntry("b"), foundEntry("c")], foundCount: 3 });
    const third = w.find('[data-entry="found:c"]');
    expect(third.find("input").attributes("placeholder")).toBe("Room 3");
    expect(third.findAll("button").some((b) => b.text() === "Name it")).toBe(true);
  });

  it("Find again is offered with the count, and reports the click", async () => {
    const w = mountList({ entries: [foundEntry("a"), foundEntry("b")], foundCount: 2 });
    expect(w.text()).toContain("2 rooms found from the walls");
    await button(w, "Find again")!.trigger("click");
    expect(w.emitted("find-again")).toHaveLength(1);
  });

  it("without a drawing the header says there is nothing to find and offers the Zone tool", async () => {
    const w = mountList({ hasDrawing: false });
    expect(w.text()).toContain("Nothing to find from the walls yet");
    expect(button(w, "Find again")).toBeUndefined();
    await button(w, "Use the Zone tool")!.trigger("click");
    expect(w.emitted("pick-zone-tool")).toHaveLength(1);
  });

  it("renaming a found room reports it, and clearing the name reports null rather than an empty label", async () => {
    const entry = foundEntry("a");
    const w = mountList({ entries: [entry], foundCount: 1 });
    const input = w.find('[data-entry="found:a"] input');
    await input.setValue("  Crypt ");
    await input.trigger("blur");
    expect(w.emitted("rename")?.[0]).toEqual([entry, "Crypt"]);
    await input.setValue("   ");
    await input.trigger("blur");
    expect(w.emitted("rename")?.[1]).toEqual([entry, null]);
  });

  it("offers the Rules toggle only on a room bound to a place", () => {
    const bound = rowEntry({ id: "b", space_location_id: "room-1" });
    const unbound = rowEntry({ id: "u" });
    expect(button(mountList({ entries: [bound] }), "Rules")).toBeDefined();
    expect(button(mountList({ entries: [unbound] }), "Rules")).toBeUndefined();
  });

  it("deleting a row asks first, and a declined confirm deletes nothing", async () => {
    mocks.confirm.mockResolvedValue(false);
    const w = mountList({ entries: [rowEntry({ id: "r9", label: "Cellar" })] });
    const del = w.findAllComponents({ name: "AppButton" }).find((b) => b.props("tooltip") === "Delete this room's shape")!;
    await del.trigger("click");
    await Promise.resolve();
    expect(mocks.remove).not.toHaveBeenCalled();
    mocks.confirm.mockResolvedValue(true);
    await del.trigger("click");
    await vi.waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("r9"));
    expect(w.emitted("removed")?.[0]).toEqual(["r9"]);
  });

  it("a found room cannot be deleted: it has no row to remove", () => {
    const w = mountList({ entries: [foundEntry("a")], foundCount: 1 });
    expect(w.findAllComponents({ name: "AppButton" }).some((b) => b.props("tooltip") === "Delete this room's shape")).toBe(false);
  });

  it("other zones sit below the rooms, each with its kind and a short state", () => {
    const zone = rowEntry({ id: "z1", region_role: "zone", zone_kind: "terrain", zone_payload: { movement_cost: 2 } });
    const w = mountList({ entries: [rowEntry({ id: "r" }), zone] });
    expect(w.find('[data-entry="z1"]').text()).toContain("terrain · difficult");
    const text = w.text();
    expect(text.indexOf("Rooms")).toBeLessThan(text.indexOf("Other zones"));
  });

  it("a bound place is left out of the Bind picker so it cannot be claimed twice", () => {
    const w = mountList({
      entries: [rowEntry({ id: "a", space_location_id: "room-1" }), rowEntry({ id: "b" })],
      spaces: [place(), place({ id: "room-2", name: "Cellar" })],
    });
    const picker = w.findComponent({ name: "EntityCombobox" });
    expect((picker.props("options") as { id: string }[]).map((o) => o.id)).toEqual(["room-2"]);
  });
});

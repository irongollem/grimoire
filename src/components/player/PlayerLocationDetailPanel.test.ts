import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

// The registry answers by image URL; only URLs listed here have a record.
const registered = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  imageProvenanceKey: (url: string) => (url.startsWith("https://cdn.test/") ? { bucket: "b", stem: url } : null),
  loadImageProvenance: vi.fn(async (key: { stem: string }) =>
    registered.has(key.stem) ? { model: "gpt-image", generatedAt: "2026-09-01T10:00:00Z" } : null,
  ),
}));

function queryPlugin(): [typeof VueQueryPlugin, { queryClient: QueryClient }] {
  return [VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }];
}
import { ref } from "vue";
import { board } from "@/components/player/noticeBoard/fixtures";

const boards = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/composables/noticeBoards/usePlayerNoticeBoards", () => ({
  usePlayerNoticeBoards: () => ({ data: ref(boards.list) }),
}));
vi.mock("@/composables/player/useReadItems", () => ({ useReadItems: () => ({ isNew: () => false }) }));
import PlayerLocationDetailPanel from "./PlayerLocationDetailPanel.vue";
import type { Location } from "@/types/location.types";
import type { PlayerNpc } from "@/types/npc.types";

function panel(over: Record<string, unknown>, npcs: unknown[] = []) {
  const loc = {
    id: "l1",
    name: "Sugarwell",
    location_type: "town",
    image_url: "https://cdn.test/sugarwell.webp",
    player_summary: "A quiet village.",
    is_map_shared: false,
    ...over,
  } as unknown as Location;
  return mount(PlayerLocationDetailPanel, {
    props: { loc, sharedChildIds: new Set<string>(), npcs: npcs as PlayerNpc[] },
    global: {
      plugins: [queryPlugin()],
      stubs: {
        PlayerSiteMap: true,
        LocationMap: true,
        PlayerStoreWares: true,
        PlayerNotesWidget: true,
        PlayerConnectionsList: true,
        RichTextViewer: true,
        PlayerNoticeBoardPreview: { props: ["board"], template: '<a data-board-card>{{ board.name }}</a>' },
      },
    },
  });
}

describe("PlayerLocationDetailPanel AI badge", () => {
  it("badges a registered image even when the row has no ai_provenance", async () => {
    registered.clear();
    registered.add("https://cdn.test/sugarwell.webp");
    const w = panel({ ai_provenance: null });
    await flushPromises();
    expect(w.text()).toContain("AI");
  });

  it("shows no badge for an unregistered image even when the row has ai_provenance", async () => {
    registered.clear();
    const w = panel({ ai_provenance: { model: "gpt-image" } });
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });

  it("shows no badge when there is no image", async () => {
    registered.clear();
    registered.add("https://cdn.test/sugarwell.webp");
    const w = panel({ image_url: null });
    await flushPromises();
    expect(w.text()).not.toContain("AI");
  });
});

describe("PlayerLocationDetailPanel notice board", () => {
  it("lists a revealed board hung at this place", async () => {
    boards.list = [board({ location_ids: ["l1"] }), board({ id: "board-2", name: "Chapel door", location_ids: ["elsewhere"] })];
    const w = panel({});
    await flushPromises();
    expect(w.text()).toContain("Notice board");
    expect(w.findAll("[data-board-card]")).toHaveLength(1);
    expect(w.text()).toContain("The Notice Board at The Pulled Sugar Inn");
    expect(w.text()).not.toContain("Chapel door");
  });

  it("shows no section when no board hangs here", async () => {
    boards.list = [board({ location_ids: ["elsewhere"] })];
    const w = panel({});
    await flushPromises();
    expect(w.find("[data-place-boards]").exists()).toBe(false);
  });
});

describe("PlayerLocationDetailPanel what the DM has shared", () => {
  it("shows the description only when it is shared", async () => {
    const hidden = panel({ description: "<p>Secret cellar</p>", is_description_shared: false });
    expect(hidden.findComponent({ name: "RichTextViewer" }).exists()).toBe(false);
    const shared = panel({ description: "<p>Secret cellar</p>", is_description_shared: true });
    expect(shared.findComponent({ name: "RichTextViewer" }).exists()).toBe(true);
  });

  it("lists the people in the area only when shared, and shows ??? for a name the projection withheld", async () => {
    const people = [
      { id: "n1", name: null, race: null, occupation: null, disguise_name: null, disguise_portrait_url: null, is_revealed: false },
      { id: "n2", name: "Mira", race: "Elf", occupation: "Cook", disguise_name: null, disguise_portrait_url: null, is_revealed: true },
    ];
    const hidden = panel({ is_npcs_shared: false }, people);
    expect(hidden.text()).not.toContain("People in the Area");
    expect(hidden.text()).not.toContain("Mira");
    const shared = panel({ is_npcs_shared: true }, people);
    expect(shared.text()).toContain("???");
    expect(shared.text()).toContain("Mira");
    expect(shared.text()).toContain("Elf · Cook");
  });

  it("names a concealed NPC by its cover name", async () => {
    const people = [
      { id: "n3", name: "Lord Varrow", race: null, occupation: null, disguise_name: "Old Tom", disguise_portrait_url: "https://cdn.test/c.webp", is_revealed: false },
    ];
    const w = panel({ is_npcs_shared: true }, people);
    expect(w.text()).toContain("Old Tom");
    expect(w.text()).not.toContain("Lord Varrow");
  });

  it("shows wares only for a store type whose inventory is shared", async () => {
    expect(panel({ location_type: "store", is_inventory_shared: true }).findComponent({ name: "PlayerStoreWares" }).exists()).toBe(true);
    expect(panel({ location_type: "store", is_inventory_shared: false }).findComponent({ name: "PlayerStoreWares" }).exists()).toBe(false);
    expect(panel({ location_type: "town", is_inventory_shared: true }).findComponent({ name: "PlayerStoreWares" }).exists()).toBe(false);
  });

  it("draws the map only when shared and not a battle map", async () => {
    const layer = { map_url: "https://cdn.test/map.webp" };
    expect(panel({ ...layer, is_map_shared: true }).findComponent({ name: "LocationMap" }).exists()).toBe(true);
    expect(panel({ ...layer, is_map_shared: false }).findComponent({ name: "LocationMap" }).exists()).toBe(false);
    expect(panel({ ...layer, is_map_shared: true, is_battle_map: true }).findComponent({ name: "LocationMap" }).exists()).toBe(false);
  });

  it("hands only pins the DM made visible to the map", async () => {
    const pin = (id: string, visible: boolean) => ({ id, child_location_id: id, visible_to_players: visible, child_name: id });
    const w = panel({ map_url: "https://cdn.test/map.webp", is_map_shared: true, map_pins: [pin("a", true), pin("b", false)] });
    const pins = w.findComponent({ name: "LocationMap" }).props("pins") as { child_location_id: string }[];
    expect(pins.map((p) => p.child_location_id)).toEqual(["a"]);
  });
});

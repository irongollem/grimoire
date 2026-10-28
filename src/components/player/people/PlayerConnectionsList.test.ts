import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import PlayerConnectionsList from "./PlayerConnectionsList.vue";
import type { Connection } from "@/types/connections.types";

const rows = vi.hoisted(() => ({ list: [] as unknown[], loading: false, failed: false }));
vi.mock("@/composables/connections/usePlayerConnections", () => ({
  usePlayerConnections: () => ({ data: ref(rows.list), isLoading: ref(rows.loading), isError: ref(rows.failed) }),
}));

function row(over: Partial<Connection>): Connection {
  return {
    source: "link", row_id: "l1", type: "friend", outward: true, other_kind: "npc", other_id: "n2",
    other_name: "Bram", other_image: null, note: null, told: null, player_visible_to: null,
    ai_provenance: null, role: null, status: null, ...over,
  };
}

const mountList = (props: Record<string, unknown> = {}) =>
  mount(PlayerConnectionsList, {
    props: { kind: "npc", id: "n1", ...props },
    global: { stubs: { FocalImage: true, RouterLink: true } },
  });

describe("PlayerConnectionsList", () => {
  it("renders nothing when the viewer knows of no ties", () => {
    rows.list = [];
    expect(mountList().find('[data-testid="player-connections"]').exists()).toBe(false);
  });

  it("groups ties people first, with the catalogue word and the told line", () => {
    rows.list = [
      row({ row_id: "a", other_kind: "faction", other_id: "f1", other_name: "The Guild", type: "sworn_to" }),
      row({ row_id: "b", told: "Shared a cell once" }),
    ];
    const w = mountList();
    const groups = w.findAll("[data-group]").map((g) => g.attributes("data-group"));
    expect(groups).toEqual(["people", "factions"]);
    expect(w.text()).toContain("friend of");
    expect(w.text()).toContain("Shared a cell once");
    expect(w.text()).toContain("Connections you know of");
  });

  it("leaves out an end shown elsewhere and never mentions hidden ties", () => {
    rows.list = [row({ other_kind: "party_member", other_id: "pm-1", other_name: "Wren" }), row({ row_id: "z" })];
    const w = mountList({ skipOtherId: "pm-1" });
    expect(w.text()).not.toContain("Wren");
    expect(w.text()).toContain("Bram");
    expect(w.text()).not.toMatch(/hidden|more|secret/i);
  });

  it("shows a skeleton while loading, and an error line when the read failed, but still no count of what it could not show", () => {
    rows.list = [];
    rows.loading = true;
    const loading = mountList();
    expect(loading.find('[data-testid="player-connections"]').exists()).toBe(true);
    expect(loading.findComponent({ name: "ListSkeleton" }).exists()).toBe(true);
    rows.loading = false;
    rows.failed = true;
    expect(mountList().text()).toContain("Could not load the connections.");
    rows.failed = false;
  });

  it("draws a faction on a token and a party member as a character, other people on a portrait", () => {
    rows.list = [
      row({ row_id: "f", other_kind: "faction", other_id: "f1", other_name: "The Guild" }),
      row({ row_id: "p", other_kind: "party_member", other_id: "pm1", other_name: "Wren" }),
      row({ row_id: "n", other_kind: "npc", other_id: "n9", other_name: "Bram" }),
    ];
    const slips = mountList().findAllComponents({ name: "ConnectionSlip" });
    const by = Object.fromEntries(slips.map((s) => [s.props("name"), [s.props("imageFormat"), s.props("pc")]]));
    expect(by).toEqual({ "The Guild": ["token", false], Wren: ["portrait", true], Bram: ["portrait", false] });
  });
});

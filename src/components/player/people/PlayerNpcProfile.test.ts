import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import PlayerNpcProfile from "./PlayerNpcProfile.vue";
import type { Connection } from "@/types/connections.types";
import type { PlayerNpc } from "@/types/npc.types";

const rows = vi.hoisted(() => ({ list: [] as unknown[], moments: new Map<string, { revealed_at: string }>() }));
vi.mock("@/composables/connections/usePlayerConnections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/connections/usePlayerConnections")>()),
  usePlayerConnections: () => ({ data: ref(rows.list), isLoading: ref(false) }),
  useViewerMemberId: () => ref("pm-1"),
}));
vi.mock("@/composables/npcs/useNpcReveals", () => ({ useMyNpcRevealMoments: () => ({ data: ref(rows.moments) }) }));

const npc = { id: "n1", name: "Maera", status: "alive", relationship: "neutral", player_visible_fields: ["name"] } as unknown as PlayerNpc;

function row(over: Partial<Connection>): Connection {
  return {
    source: "link", row_id: "l1", type: "ally", outward: true, other_kind: "party_member", other_id: "pm-1",
    other_name: "Wren", other_image: null, note: null, told: "<p>Pulled you from the river</p>", player_visible_to: null,
    ai_provenance: null, role: null, status: null, ...over,
  };
}

const mountProfile = (n: PlayerNpc = npc, place: string | null = null) =>
  mount(PlayerNpcProfile, {
    props: { npc: n, place },
    global: {
      stubs: {
        NpcRatingStars: true, RelationshipMark: true, FamilyBlock: true, PlayerNpcMemories: true,
        PlayerNotesWidget: true, PlayerConnectionsList: true, FocalImage: true, AppButton: true,
      },
    },
  });

describe("PlayerNpcProfile", () => {
  it("shows the tie to the viewer's own character as Your connection", () => {
    rows.list = [row({}), row({ row_id: "x", other_kind: "npc", other_id: "n9", other_name: "Bram" })];
    const w = mountProfile();
    const mine = w.get('[data-testid="your-connection"]');
    expect(mine.text()).toContain("Your connection");
    expect(mine.text()).toContain("ally of");
    expect(mine.text()).toContain("Pulled you from the river");
    expect(mine.text()).not.toContain("Bram");
  });

  it("shows no Your connection when the viewer's character has no revealed tie", () => {
    rows.list = [row({ other_id: "pm-2" })];
    expect(mountProfile().find('[data-testid="your-connection"]').exists()).toBe(false);
  });

  const who = (over: Record<string, unknown>) => ({ ...npc, ...over }) as unknown as PlayerNpc;

  it("shows ??? and never the true name when the name is not shared", () => {
    const w = mountProfile(who({ player_visible_fields: ["race"], race: "Elf" }));
    expect(w.get("h2").text()).toBe("???");
    expect(w.html()).not.toContain("Maera");
  });

  it("states race and occupation only when shared", () => {
    const hidden = mountProfile(who({ race: "Elf", occupation: "Cook", player_visible_fields: ["name"] }));
    expect(hidden.text()).not.toContain("Elf");
    expect(hidden.text()).not.toContain("Cook");
    const shown = mountProfile(who({ race: "Elf", occupation: "Cook", player_visible_fields: ["name", "race", "occupation"] }));
    expect(shown.text()).toContain("Elf · Cook");
  });

  it("strikes the name through for the dead, with the status word", () => {
    const dead = mountProfile(who({ status: "dead" }));
    expect(dead.get("h2").classes()).toContain("line-through");
    expect(dead.text()).toContain("Dead");
    expect(mountProfile().get("h2").classes()).not.toContain("line-through");
  });

  it("shows when and where they were met only when known", () => {
    rows.moments = new Map();
    expect(mountProfile().text()).not.toContain("Met");
    expect(mountProfile().text()).not.toContain("Where");
    const placeOnly = mountProfile(npc, "The Pulled Sugar Inn");
    expect(placeOnly.text()).toContain("Where");
    expect(placeOnly.text()).not.toContain("Met");
    rows.moments = new Map([["n1", { revealed_at: "2020-03-09T12:00:00Z" }]]);
    const w = mountProfile(npc, "The Pulled Sugar Inn");
    expect(w.text()).toContain("Met");
    expect(w.text()).toContain("9 March 2020");
    expect(w.text()).toContain("Where");
    expect(w.text()).toContain("The Pulled Sugar Inn");
    rows.moments = new Map();
  });
});

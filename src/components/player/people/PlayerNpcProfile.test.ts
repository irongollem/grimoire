import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import PlayerNpcProfile from "./PlayerNpcProfile.vue";
import type { Connection } from "@/types/connections.types";
import type { PlayerNpc } from "@/types/npc.types";

const rows = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock("@/composables/connections/usePlayerConnections", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/composables/connections/usePlayerConnections")>()),
  usePlayerConnections: () => ({ data: ref(rows.list), isLoading: ref(false) }),
  useViewerMemberId: () => ref("pm-1"),
}));
vi.mock("@/composables/npcs/useNpcReveals", () => ({ useMyNpcRevealMoments: () => ({ data: ref(new Map()) }) }));

const npc = { id: "n1", name: "Maera", status: "alive", relationship: "neutral", player_visible_fields: ["name"] } as unknown as PlayerNpc;

function row(over: Partial<Connection>): Connection {
  return {
    source: "link", row_id: "l1", type: "ally", outward: true, other_kind: "party_member", other_id: "pm-1",
    other_name: "Wren", other_image: null, note: null, told: "<p>Pulled you from the river</p>", player_visible_to: null,
    ai_provenance: null, role: null, status: null, ...over,
  };
}

const mountProfile = () =>
  mount(PlayerNpcProfile, {
    props: { npc },
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
});

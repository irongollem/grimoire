import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { tie } from "@/lib/worldWeb/tieFixture";
import type { TypeChoice } from "@/lib/worldLinks/connections";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ confirm: vi.fn(), success: vi.fn(), error: vi.fn() }));

// The real connections layer runs on the fake database; only the shell around it is stubbed.
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));
vi.mock("@/lib/queueEmbeddings", () => ({ queueEmbeddingsInBackground: vi.fn() }));
vi.mock("@/composables/useConfirm", () => ({ useConfirm: () => ({ confirm: mocks.confirm }) }));
vi.mock("@/composables/useToast", () => ({
  useToast: () => ({ success: mocks.success, error: mocks.error, fromError: (e: unknown, f: string) => (typeof e === "object" && e !== null && "message" in e ? String(e.message) : f) }),
}));

import { useWorldWebEditing } from "./useWorldWebEditing";

function mountEditing(): ReturnType<typeof useWorldWebEditing> {
  let editing!: ReturnType<typeof useWorldWebEditing>;
  mount(defineComponent({ setup() { editing = useWorldWebEditing(); return () => null; } }), {
    global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
  return editing;
}

const choice: TypeChoice = { key: "worships", word: "worships", subjectIsFrom: true, family: "faith", common: true, pair: "person_deity" };

// Brenna (an NPC) worships the Drowned Lady (a deity), plus an unrelated link that must never be touched.
const brennaWorships = { id: "r1", campaign_id: "c1", type: "worships", from_kind: "npc", to_kind: "deity", from_npc_id: "brenna", to_deity_id: "lady", note: "Prays at dusk", told: null };
const unrelated = { id: "other", campaign_id: "c1", type: "knows", from_kind: "npc", to_kind: "npc", from_npc_id: "harl", to_npc_id: "brenna", note: null, told: null };

describe("useWorldWebEditing", () => {
  beforeEach(() => {
    fake.reset();
    Object.values(mocks).forEach((m) => m.mockReset());
    fake.seed("world_links", [brennaWorships, unrelated]);
  });

  it("ties two things in the direction the chosen word reads, in this campaign, and says so", async () => {
    const ok = await mountEditing().connect("npc:harl", { kind: "deity", id: "lady", name: "The Drowned Lady" }, choice);
    expect(ok).toBe(true);
    expect(fake.rows("world_links")).toHaveLength(3);
    expect(fake.rows("world_links")[2]).toMatchObject({
      campaign_id: "c1",
      user_id: "dm-1",
      type: "worships",
      from_kind: "npc",
      from_npc_id: "harl",
      to_kind: "deity",
      to_deity_id: "lady",
    });
    expect(mocks.success).toHaveBeenCalledWith("Tied together.");
  });

  it("refuses to start a tie from a quest and writes nothing", async () => {
    const ok = await mountEditing().connect("quest:q1", { kind: "npc", id: "harl", name: "Harl" }, choice);
    expect(ok).toBe(false);
    expect(fake.calls).toHaveLength(0);
    expect(mocks.error).toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("reports a failed write instead of swallowing it", async () => {
    fake.failNext("world_links", { message: "denied" });
    const ok = await mountEditing().connect("npc:harl", { kind: "deity", id: "lady", name: "L" }, choice);
    expect(ok).toBe(false);
    expect(mocks.error).toHaveBeenCalledWith("denied");
    expect(mocks.success).not.toHaveBeenCalled();
    expect(fake.rows("world_links")).toHaveLength(2);
  });

  it("retyping from the other end flips the link so the subject is the one who worships, and touches no other link", async () => {
    const ok = await mountEditing().retypeTie(tie({}), "deity:lady", choice);
    expect(ok).toBe(true);
    const row = fake.rows("world_links").find((r) => r.id === "r1");
    expect(row).toMatchObject({ type: "worships", from_kind: "deity", from_deity_id: "lady", to_kind: "npc", to_npc_id: "brenna" });
    // The old ends are cleared, not left beside the new ones.
    expect(row?.from_npc_id).toBeNull();
    expect(row?.to_deity_id).toBeNull();
    expect(row?.note).toBe("Prays at dusk");
    expect(fake.rows("world_links").find((r) => r.id === "other")).toEqual(unrelated);
  });

  it("removes a tie only after the DM confirms, and only that tie", async () => {
    mocks.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const editing = mountEditing();
    expect(await editing.removeTie(tie({}), "npc:brenna")).toBe(false);
    expect(fake.rows("world_links")).toHaveLength(2);
    expect(await editing.removeTie(tie({}), "npc:brenna")).toBe(true);
    expect(fake.rows("world_links").map((r) => r.id)).toEqual(["other"]);
  });

  it("saves a link's note and the line players are told together, on that link alone", async () => {
    await mountEditing().saveWords(tie({ row_id: "r1" }), { note: "Owes Harl", told: "Every dawn she leaves a coin." });
    expect(fake.rows("world_links").find((r) => r.id === "r1")).toMatchObject({ note: "Owes Harl", told: "Every dawn she leaves a coin." });
    expect(fake.rows("world_links").find((r) => r.id === "other")).toEqual(unrelated);
  });
});

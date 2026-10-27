import { describe, expect, it, vi, beforeEach } from "vitest";
import { defineComponent, h } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { findMyConnection, usePlayerConnections, useViewerMemberId } from "./usePlayerConnections";
import { useAuthStore } from "@/stores/auth";
import type { CampaignMember } from "@/types/campaign.types";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import type { Connection } from "@/types/connections.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

function row(over: Partial<Connection>): Connection {
  return {
    source: "link", row_id: "l1", type: "friend", outward: true, other_kind: "party_member", other_id: "pm-1",
    other_name: "Wren", other_image: null, note: null, told: "Old friends", player_visible_to: null,
    ai_provenance: null, role: null, status: null, ...over,
  };
}

function run() {
  let result!: ReturnType<typeof usePlayerConnections>;
  const Host = defineComponent({
    setup() {
      result = usePlayerConnections("npc", "npc-1");
      return () => h("div");
    },
  });
  mount(Host, { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } });
  return result;
}

describe("usePlayerConnections", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
  });

  // The server answers by who is looking: the previewed character for a DM,
  // nobody-in-particular for a real player (null).
  function knownTo(memberId: string | null) {
    fake.onRpc("get_player_connections", (args) =>
      args.p_preview_member_id === memberId && args.p_campaign_id === "c1" ? [row({})] : [],
    );
  }

  it("a DM previewing a character reads what that character knows", async () => {
    useCampaignStore().activeCampaignId = "c1";
    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-9";
    knownTo("pm-9");
    const q = run();
    await flushPromises();
    expect(q.data.value).toHaveLength(1);
  });

  it("a real player reads as themself, not as a previewed character", async () => {
    useCampaignStore().activeCampaignId = "c1";
    knownTo(null);
    const q = run();
    await flushPromises();
    expect(q.data.value).toHaveLength(1);
  });

  it("surfaces an rpc error rather than an empty list", async () => {
    useCampaignStore().activeCampaignId = "c1";
    fake.failNext("get_player_connections", { message: "denied" });
    const q = run();
    await flushPromises();
    expect(q.isError.value).toBe(true);
  });
});

describe("findMyConnection", () => {
  it("finds the tie to the viewer's own character only", () => {
    const rows = [row({ other_kind: "npc", other_id: "pm-1", row_id: "c" }), row({ other_id: "pm-2", row_id: "a" }), row({ other_id: "pm-1", row_id: "b" })];
    expect(findMyConnection(rows, "pm-1")?.row_id).toBe("b");
    expect(findMyConnection(rows, null)).toBeNull();
    expect(findMyConnection(rows, "pm-3")).toBeNull();
  });
});

describe("useViewerMemberId", () => {
  beforeEach(() => setActivePinia(createPinia()));

  it("is the seated character for a player, and the previewed one for a DM in preview", () => {
    const auth = useAuthStore();
    const seat: CampaignMember = {
      id: "m1", campaign_id: "c1", user_id: "u1", role: "player", party_member_id: "pm-seat",
      display_name: null, joined_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
    };
    auth.membership = seat;
    const viewer = useViewerMemberId();
    expect(viewer.value).toBe("pm-seat");

    const app = useAppUiStore();
    app.dmPreviewMode = true;
    app.dmPreviewPartyMemberId = "pm-preview";
    expect(viewer.value).toBe("pm-preview");
  });

  it("is null for an unseated player outside preview", () => {
    expect(useViewerMemberId().value).toBeNull();
  });
});

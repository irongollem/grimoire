import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
const mocks = vi.hoisted(() => ({ createEntry: vi.fn(), connect: vi.fn() }));
const campaign = vi.hoisted(() => ({ activeCampaignId: "c1", activeCampaign: { calendar_id: "harptos" as string | null, current_year: 1492, current_month: 3, current_day: 18 } }));
const session = ref<{ id: string } | null>({ id: "sess-1" });

vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "dm-1" }) }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => campaign }));
vi.mock("@/composables/campaign/useCampaignSession", () => ({ useCampaignSession: () => ({ session }) }));
vi.mock("@/composables/canon/useCanonEntries", () => ({ useCreateCanonEntry: () => ({ mutateAsync: mocks.createEntry }) }));
vi.mock("@/composables/connections/useConnections", () => ({ useCreateConnection: () => ({ mutateAsync: mocks.connect }) }));

import { useAcceptForce, useReachForceStep, useTickForce } from "./useCanonForces";

function inSetup<T>(use: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = use(); return () => null; } }), { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } });
  return result;
}

describe("the force hooks", () => {
  beforeEach(() => {
    fake.reset();
    mocks.createEntry.mockReset();
    mocks.connect.mockReset();
    session.value = { id: "sess-1" };
    campaign.activeCampaign.calendar_id = "harptos";
  });

  it("a tick carries the open session and the world's date, so the log says when in the story it moved", async () => {
    await inSetup(useTickForce).mutateAsync({ campaignId: "c1", forceId: "f1", delta: 1, note: "A week passed" });
    expect(fake.rows("canon_force_ticks")).toMatchObject([{ force_id: "f1", delta: 1, note: "A week passed", session_id: "sess-1", world_year: 1492, world_month: 3, world_day: 18 }]);
  });

  it("a tick with no session running and no calendar chosen carries neither", async () => {
    session.value = null;
    campaign.activeCampaign.calendar_id = null;
    await inSetup(useTickForce).mutateAsync({ campaignId: "c1", forceId: "f1", delta: -1, note: "" });
    expect(fake.rows("canon_force_ticks")).toMatchObject([{ delta: -1, session_id: null, world_year: null, world_month: null, world_day: null }]);
  });

  it("reaching a step stamps the open session on the step and on its tick", async () => {
    fake.seed("canon_force_steps", [{ id: "st1", campaign_id: "c1", force_id: "f1", title: "The river runs bitter.", reached_at: null, reached_session_id: null }]);
    const step = { id: "st1", campaign_id: "c1", force_id: "f1", title: "The river runs bitter." } as never;
    await inSetup(useReachForceStep).mutateAsync({ step, reached: true });
    expect(fake.rows("canon_force_steps")).toMatchObject([{ reached_session_id: "sess-1" }]);
    expect(fake.rows("canon_force_ticks")).toMatchObject([{ session_id: "sess-1", step_id: "st1", note: "Reached: The river runs bitter." }]);
  });

  it("accepting a force about a person ties it with the `about` link from the force, carrying the run's provenance", async () => {
    mocks.createEntry.mockResolvedValue({ id: "f9" });
    const provenance = { generatorType: "canon_force_suggestion" } as never;
    await inSetup(useAcceptForce)(
      { title: "Mara's plan", who: { kind: "npc", id: "n1", name: "Mara" }, wants: "the bell", steps: [], clockSize: 4, quests: [] },
      provenance,
      0,
    );
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      subject: { kind: "canon", id: "f9" },
      other: { kind: "npc", id: "n1", name: "Mara" },
      choice: expect.objectContaining({ key: "about" }),
      aiProvenance: provenance,
    }));
    await flushPromises();
  });
});

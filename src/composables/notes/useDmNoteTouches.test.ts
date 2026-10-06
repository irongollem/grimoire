import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import type { CampaignSessionState } from "@/types/session.types";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useDmNoteTouches } from "./useDmNoteTouches";

const mocks = vi.hoisted(() => ({
  calls: [] as [string, ...unknown[]][],
  rows: [] as unknown[],
  session: null as unknown,
  running: false,
}));

vi.mock("@/lib/supabase", () => {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "gte", "lte"]) {
    builder[m] = (...args: unknown[]) => {
      mocks.calls.push([m, ...args]);
      return builder;
    };
  }
  builder.order = (...args: unknown[]) => {
    mocks.calls.push(["order", ...args]);
    return Promise.resolve({ data: mocks.rows, error: null });
  };
  return { supabase: { from: () => builder } };
});

vi.mock("@/composables/campaign/useCampaignSession", async () => {
  const { computed } = await import("vue");
  return {
    useCampaignSession: () => ({
      session: ref(mocks.session),
      isRunning: computed(() => mocks.running),
    }),
  };
});

function setup() {
  let handle!: ReturnType<typeof useDmNoteTouches>;
  mount(
    defineComponent({
      setup() {
        handle = useDmNoteTouches();
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return handle;
}

const session = (over: Partial<CampaignSessionState>) => ({ started_at: null, ended_at: null, is_running: false, ...over });

describe("useDmNoteTouches", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useAuthStore().user = { id: "me" } as never;
    useCampaignStore().activeCampaignId = "camp-1";
    mocks.calls.length = 0;
    mocks.rows = [{ id: "t1", entity_label: "Brenna" }];
  });

  it("reads since the start of a running session, scoped to me and the campaign", async () => {
    mocks.session = session({ started_at: "2026-10-06T18:00:00Z", is_running: true });
    mocks.running = true;
    const h = setup();
    await flushPromises();
    expect(h.label.value).toBe("This session");
    expect(h.touches.value).toHaveLength(1);
    expect(mocks.calls).toContainEqual(["eq", "user_id", "me"]);
    expect(mocks.calls).toContainEqual(["eq", "campaign_id", "camp-1"]);
    expect(mocks.calls).toContainEqual(["gte", "touched_at", "2026-10-06T18:00:00Z"]);
    expect(mocks.calls.some(([m]) => m === "lte")).toBe(false);
    expect(mocks.calls).toContainEqual(["order", "touched_at", { ascending: false }]);
  });

  it("reads the span of the last session once it has ended", async () => {
    mocks.session = session({ started_at: "2026-10-01T18:00:00Z", ended_at: "2026-10-01T22:00:00Z" });
    mocks.running = false;
    const h = setup();
    await flushPromises();
    expect(h.label.value).toBe("Last session");
    expect(mocks.calls).toContainEqual(["lte", "touched_at", "2026-10-01T22:00:00Z"]);
  });

  it("is empty with no label when there has never been a session", async () => {
    mocks.session = null;
    mocks.running = false;
    const h = setup();
    await flushPromises();
    expect(h.label.value).toBeNull();
    expect(h.touches.value).toHaveLength(0);
    expect(mocks.calls).toHaveLength(0);
  });
});

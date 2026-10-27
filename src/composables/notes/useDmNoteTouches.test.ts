import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, ref } from "vue";
import type { CampaignSession } from "@/types/session.types";
import { useAuthStore } from "@/stores/auth";
import { useCampaignStore } from "@/stores/campaign";
import { useDmNoteTouches } from "./useDmNoteTouches";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

const mocks = vi.hoisted(() => ({
  session: null as unknown,
  running: false,
  log: [] as unknown[],
}));

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

vi.mock("@/composables/sessions/useCampaignSessions", () => ({
  useCampaignSessions: () => ({ data: ref(mocks.log) }),
}));

vi.mock("@/composables/campaign/useCampaignSession", async () => {
  const { computed } = await import("vue");
  return {
    useCampaignSession: () => ({
      session: ref(mocks.session),
      isRunning: computed(() => mocks.running),
    }),
  };
});

function setup(enabled?: () => boolean) {
  let handle!: ReturnType<typeof useDmNoteTouches>;
  mount(
    defineComponent({
      setup() {
        handle = useDmNoteTouches(enabled);
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return handle;
}

const session = (over: Partial<CampaignSession>) => ({ id: "s", started_at: null, ended_at: null, ...over });

const touch = (id: string, touched_at: string, over: Record<string, unknown> = {}) => ({
  id,
  user_id: "me",
  campaign_id: "camp-1",
  entity_label: id,
  touched_at,
  ...over,
});

describe("useDmNoteTouches", () => {
  beforeEach(() => {
    fake.reset();
    setActivePinia(createPinia());
    useAuthStore().user = { id: "me" } as never;
    useCampaignStore().activeCampaignId = "camp-1";
    mocks.log = [];
  });

  it("while a session runs, reads my touches in this campaign since it began, newest first, with no upper bound", async () => {
    fake.seed("dm_note_touches", [
      touch("before", "2026-10-06T17:59:59Z"),
      touch("early", "2026-10-06T18:00:00Z"),
      touch("later", "2026-10-07T09:00:00Z"),
      touch("co-dm", "2026-10-06T19:00:00Z", { user_id: "someone-else" }),
      touch("other-campaign", "2026-10-06T19:00:00Z", { campaign_id: "camp-2" }),
    ]);
    mocks.session = session({ started_at: "2026-10-06T18:00:00Z" });
    mocks.running = true;
    const h = setup();
    await flushPromises();
    expect(h.label.value).toBe("This session");
    expect(h.touches.value.map((x) => x.id)).toEqual(["later", "early"]);
  });

  it("with none running, reads exactly the span of the session that ended last, however the log is ordered", async () => {
    // The live session is only the open row: once ended it is gone from there.
    fake.seed("dm_note_touches", [
      touch("older-session", "2026-09-24T19:00:00Z"),
      touch("last-start", "2026-10-01T18:00:00Z"),
      touch("last-end", "2026-10-01T22:00:00Z"),
      touch("after", "2026-10-01T22:00:01Z"),
    ]);
    mocks.session = null;
    mocks.running = false;
    mocks.log = [
      // Started but never ended (abandoned): it has no span either.
      session({ started_at: "2026-10-02T18:00:00Z" }),
      session({ started_at: "2026-10-01T18:00:00Z", ended_at: "2026-10-01T22:00:00Z" }),
      session({ started_at: "2026-09-24T18:00:00Z", ended_at: "2026-09-24T22:00:00Z" }),
      // Logged by hand afterwards: never run, so no span to read.
      session({ played_on: "2026-10-03" }),
    ];
    const h = setup();
    await flushPromises();
    expect(h.label.value).toBe("Last session");
    expect(h.touches.value.map((x) => x.id)).toEqual(["last-end", "last-start"]);
  });

  it("is empty with no label, and reads nothing, when there has never been a session", async () => {
    fake.seed("dm_note_touches", [touch("t1", "2026-10-06T19:00:00Z")]);
    mocks.session = null;
    mocks.running = false;
    const h = setup();
    await flushPromises();
    expect(h.label.value).toBeNull();
    expect(h.touches.value).toHaveLength(0);
    expect(fake.calls).toHaveLength(0);
  });

  it("reads nothing while the panel is hidden, and reads once it is shown (#999)", async () => {
    fake.seed("dm_note_touches", [touch("t1", "2026-10-06T19:00:00Z")]);
    mocks.session = session({ started_at: "2026-10-06T18:00:00Z" });
    mocks.running = true;
    const shown = ref(false);
    const h = setup(() => shown.value);
    await flushPromises();
    expect(fake.calls).toHaveLength(0);
    expect(h.touches.value).toHaveLength(0);

    shown.value = true;
    await flushPromises();
    expect(h.touches.value.map((x) => x.id)).toEqual(["t1"]);
  });
});

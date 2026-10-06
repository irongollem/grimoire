import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent } from "vue";
import { useAuthStore } from "@/stores/auth";

const mocks = vi.hoisted(() => ({ reads: 0 }));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => {
          mocks.reads += 1;
          return Promise.resolve({ data: [], error: null });
        },
      }),
    }),
  },
}));

// A fixed list, so the test does not depend on which notices the app ships today.
vi.mock("@/lib/announcements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/announcements")>();
  return {
    ...actual,
    ANNOUNCEMENTS: [
      { id: "a", title: "A", body: "b", publishedAt: "2026-10-02" },
    ],
  };
});

import { useAnnouncements } from "./useAnnouncements";

function setup() {
  let handle!: ReturnType<typeof useAnnouncements>;
  mount(
    defineComponent({
      setup() {
        handle = useAnnouncements();
        return () => null;
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return handle;
}

describe("useAnnouncements", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mocks.reads = 0;
  });

  it("reads the dismissals when an announcement could still be shown", async () => {
    useAuthStore().user = { id: "me", created_at: "2026-01-01T00:00:00Z" } as never;
    const h = setup();
    await flushPromises();
    expect(mocks.reads).toBe(1);
    expect(h.current.value?.id).toBe("a");
  });

  it("reads nothing for an account created after every announcement (#999)", async () => {
    useAuthStore().user = { id: "me", created_at: "2026-10-05T00:00:00Z" } as never;
    const h = setup();
    await flushPromises();
    expect(mocks.reads).toBe(0);
    expect(h.current.value).toBeNull();
  });
});

import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, nextTick } from "vue";
import type { User } from "@supabase/supabase-js";
import { useAuthStore } from "@/stores/auth";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

// A fixed list, so the test does not depend on which notices the app ships today.
vi.mock("@/lib/announcements", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/announcements")>();
  return {
    ...actual,
    ANNOUNCEMENTS: [{ id: "a", title: "A", body: "b", publishedAt: "2026-10-02" }],
  };
});

import { useAnnouncements } from "./useAnnouncements";

function signIn(createdAt: string) {
  useAuthStore().user = { id: "me", created_at: createdAt } as User;
}

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
    fake.reset();
  });

  it("shows an announcement this account has not dismissed", async () => {
    signIn("2026-01-01T00:00:00Z");
    const h = setup();
    await flushPromises();
    expect(h.current.value?.id).toBe("a");
  });

  it("another account's dismissal does not hide it from this one", async () => {
    signIn("2026-01-01T00:00:00Z");
    fake.seed("announcement_dismissals", [{ user_id: "someone-else", announcement_id: "a" }]);
    const h = setup();
    await flushPromises();
    expect(h.current.value?.id).toBe("a");
  });

  it("stays hidden once this account has dismissed it", async () => {
    signIn("2026-01-01T00:00:00Z");
    fake.seed("announcement_dismissals", [{ user_id: "me", announcement_id: "a" }]);
    const h = setup();
    await flushPromises();
    expect(h.current.value).toBeNull();
  });

  it("shows nothing while the dismissals cannot be read, rather than risk re-showing a dismissed notice", async () => {
    signIn("2026-01-01T00:00:00Z");
    fake.failNext("announcement_dismissals", { message: "boom" });
    const h = setup();
    await flushPromises();
    expect(h.current.value).toBeNull();
  });

  it("reads nothing for an account created after every announcement (#999)", async () => {
    signIn("2026-10-05T00:00:00Z");
    const h = setup();
    await flushPromises();
    expect(fake.calls.filter((c) => c.target === "announcement_dismissals")).toHaveLength(0);
    expect(h.current.value).toBeNull();
  });

  it("dismissing records the dismissal for this account and hides the notice", async () => {
    signIn("2026-01-01T00:00:00Z");
    const h = setup();
    await flushPromises();
    h.dismiss("a");
    await flushPromises();
    expect(fake.rows("announcement_dismissals")).toMatchObject([{ user_id: "me", announcement_id: "a" }]);
    expect(h.current.value).toBeNull();
  });

  it("hides the notice at once, before the insert has come back", async () => {
    signIn("2026-01-01T00:00:00Z");
    const h = setup();
    await flushPromises();
    h.dismiss("a");
    await nextTick();
    expect(h.current.value).toBeNull();
    expect(fake.rows("announcement_dismissals")).toEqual([]);
  });
});

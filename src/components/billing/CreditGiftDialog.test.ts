import { flushPromises, mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import { useAuthStore } from "@/stores/auth";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});

vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));

import CreditGiftDialog from "./CreditGiftDialog.vue";

const stubs = {
  AppModal: { props: ["open"], emits: ["close"], template: "<div v-if='open' data-modal><slot /></div>" },
  ModalHeader: { props: ["title"], template: "<h2>{{ title }}</h2>" },
};

async function mountDialog() {
  const w = mount(CreditGiftDialog, {
    global: { stubs, plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] },
  });
  await flushPromises();
  return w;
}

const gift = (over: Record<string, unknown>) => ({
  id: "g1", user_id: "me", credits: 250, message: null, seen_at: null, created_at: "2026-11-26T00:00:00Z", ...over,
});

describe("CreditGiftDialog", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    fake.reset();
    useAuthStore().user = { id: "me" } as User;
  });

  // Bug: the gift total counts a gift already seen, or one given to another account.
  it("tells this account about its unseen gifts only, with the admin's message", async () => {
    fake.seed("credit_gifts", [
      gift({ id: "g1", credits: 250, message: "Thanks for reporting the recipe bug!" }),
      gift({ id: "g2", credits: 100, seen_at: "2026-11-01T00:00:00Z", message: "old" }),
      gift({ id: "g3", user_id: "someone-else", credits: 900, message: "not yours" }),
    ]);
    const w = await mountDialog();
    expect(w.find("h2").text()).toBe("You've been given 250 credits");
    expect(w.text()).toContain("Thanks for reporting the recipe bug!");
    expect(w.text()).not.toContain("old");
    expect(w.text()).not.toContain("not yours");
  });

  // Bug: the dialog opens on every page load for an account with nothing to tell.
  it("stays closed with no unseen gift", async () => {
    fake.seed("credit_gifts", [gift({ seen_at: "2026-11-01T00:00:00Z" })]);
    const w = await mountDialog();
    expect(w.find("[data-modal]").exists()).toBe(false);
  });

  // Bug: Thanks closes the dialog but never records it, so it comes back on the next visit.
  it("Thanks marks every gift shown as seen and closes", async () => {
    fake.seed("credit_gifts", [gift({ id: "g1" }), gift({ id: "g2", credits: 40 })]);
    const w = await mountDialog();
    expect(w.find("h2").text()).toBe("You've been given 290 credits");
    await w.find("button").trigger("click");
    await flushPromises();
    expect(fake.rows("credit_gifts").every((g) => g.seen_at !== null)).toBe(true);
    expect(w.find("[data-modal]").exists()).toBe(false);
  });
});

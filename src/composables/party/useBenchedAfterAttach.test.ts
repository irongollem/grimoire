import { beforeEach, describe, expect, it, vi } from "vitest";
import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client }));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaignId: "c1" }) }));

import { benchedMessage, useBenchedAfterAttach } from "./useBenchedAfterAttach";

describe("benchedMessage", () => {
  it("names the character and the table and counts the choices", () => {
    expect(benchedMessage("Mira", "Strahd", 1)).toBe(
      "Mira joined Strahd, but 1 choice is waiting for the DM's approval. They cannot be made active yet.",
    );
    expect(benchedMessage("Mira", "Strahd", 3)).toContain("3 choices are waiting");
    expect(benchedMessage("Mira", null, 2)).toContain("joined the table");
    expect(benchedMessage(null, "Strahd", 2)).toMatch(/^Your character joined Strahd/);
  });
});

describe("useBenchedAfterAttach", () => {
  beforeEach(() => fake.reset());

  function open() {
    let attach!: ReturnType<typeof useBenchedAfterAttach>;
    mount(
      defineComponent({
        setup() {
          attach = useBenchedAfterAttach();
          return () => h("div");
        },
      }),
      { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient({ defaultOptions: { queries: { retry: false } } }) }]] } },
    );
    return attach;
  }

  const flag = (id: string, member: string, status: string) => ({
    id, party_member_id: member, status, created_at: "2026-10-01T00:00:00Z",
  });

  it("counts only the pending flags on the character that was just attached", async () => {
    fake.seed("character_content_reviews", [
      flag("a", "char-1", "pending"),
      flag("b", "char-1", "approved"),
      flag("c", "char-1", "pending"),
      flag("d", "char-2", "pending"),
    ]);
    expect(await open().waitingAfterAttach("char-1")).toBe(2);
  });

  it("is zero when nothing is flagged", async () => {
    expect(await open().waitingAfterAttach("char-1")).toBe(0);
  });

  it("lets a failed read reach the caller, so an attach that worked is not undone by it", async () => {
    fake.failNext("character_content_reviews", { message: "offline" });
    await expect(open().waitingAfterAttach("char-1")).rejects.toMatchObject({ message: "offline" });
  });
});

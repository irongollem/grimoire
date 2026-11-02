import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { DowntimeEffect } from "@/types/downtime.types";

const { fake } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake() };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/composables/currency/useCurrency", () => ({
  useCurrency: () => ({
    currency: ref({
      default_key: "gp",
      denominations: [
        { key: "gp", name: "Gold", abbr: "gp", color: "#000000", value: 10, makes_change: true },
        { key: "sp", name: "Silver", abbr: "sp", color: "#000000", value: 1, makes_change: true },
      ],
    }),
  }),
}));

import { useApplyEffects } from "./useDowntime";

function mountApply() {
  let out!: ReturnType<typeof useApplyEffects>;
  mount(
    defineComponent({
      setup() {
        out = useApplyEffects();
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return out;
}

const effects: DowntimeEffect[] = [
  { kind: "gold", applied: true, note: null, gain: { gp: 5 }, spend: { sp: 3 } },
  { kind: "hp", applied: true, note: null, delta: -4 },
  { kind: "condition", applied: true, note: null, condition: "Poisoned" },
];

beforeEach(() => {
  fake.reset();
  fake.seed("party_members", [{ id: "m1", current_hp: 10, max_hp: 12, conditions: [{ name: "Prone" }], coins: { gp: 1 } }]);
  fake.onRpc("apply_downtime_effects", () => ({}));
});

describe("useApplyEffects", () => {
  it("applies gain, cost, HP and conditions in one call, and writes no party_members row (cost and gain used to be two requests, so a refused cost could leave the gain half-applied)", async () => {
    await mountApply().mutateAsync({ partyMemberId: "m1", effects });
    const rpc = fake.calls.filter((c) => c.kind === "rpc");
    expect(rpc.map((c) => [c.target, c.payload])).toEqual([
      [
        "apply_downtime_effects",
        {
          p_member_id: "m1",
          p_gain: { gp: 5 },
          p_spend: { sp: 3 },
          p_current_hp: 6,
          p_conditions: [{ name: "Prone" }, { name: "Poisoned" }],
        },
      ],
    ]);
    expect(fake.calls.filter((c) => c.kind === "table" && c.op !== "select")).toEqual([]);
  });

  it("surfaces the server's refusal of an unaffordable cost", async () => {
    fake.failNext("apply_downtime_effects", { message: "Insufficient funds" });
    await expect(mountApply().mutateAsync({ partyMemberId: "m1", effects })).rejects.toMatchObject({
      message: "Insufficient funds",
    });
  });
});

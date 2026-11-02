import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import type { PartyMember } from "@/types/party.types";

const { fake, chat } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), chat: { sendCurrencyDrop: vi.fn() } };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => chat }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref([]) }),
  useUpdatePartyMember: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/composables/rules/useSpecies", () => ({ useSpeciesByIds: () => ({ data: ref(new Map()) }) }));
vi.mock("@/composables/items/useGiveInventory", () => ({ useGiveCoins: () => ({ mutateAsync: vi.fn() }) }));
vi.mock("@/composables/currency/useCurrency", () => ({
  useCurrency: () => ({
    currency: ref({ default_key: "gp", denominations: [{ key: "gp", name: "Gold", abbr: "gp", color: "#000000", value: 10, makes_change: true }] }),
  }),
}));

import { useCharacterPurse } from "./useCharacterPurse";

function mountPurse() {
  const member = ref({ id: "m1", name: "Vex", coins: { gp: 5 } } as unknown as PartyMember);
  let out!: ReturnType<typeof useCharacterPurse>;
  mount(
    defineComponent({
      setup() {
        out = useCharacterPurse(member, ref(0));
        return () => h("div");
      },
    }),
    { global: { plugins: [[VueQueryPlugin, { queryClient: new QueryClient() }]] } },
  );
  return out;
}

const rpcCalls = (name: string) => fake.calls.filter((c) => c.kind === "rpc" && c.target === name);

beforeEach(() => {
  fake.reset();
  chat.sendCurrencyDrop.mockReset();
  fake.onRpc("adjust_purse", () => ({}));
  fake.onRpc("set_purse_coin", () => ({}));
});

describe("useCharacterPurse coin writes", () => {
  it("sends each quick +/- as its own signed delta, never a whole-map update that one click would revert for the other", async () => {
    const purse = mountPurse();
    await Promise.all([purse.adjustCurrency("gp", 1), purse.adjustCurrency("sp", 1)]);
    expect(rpcCalls("adjust_purse").map((c) => c.payload)).toEqual([
      { p_member_id: "m1", p_delta: { gp: 1 } },
      { p_member_id: "m1", p_delta: { sp: 1 } },
    ]);
    expect(fake.calls.filter((c) => c.kind === "table" && c.op === "update")).toEqual([]);
  });

  it("writes a typed count through set_purse_coin for that one coin", async () => {
    const purse = mountPurse();
    await purse.setCurrency("gp", 12);
    expect(rpcCalls("set_purse_coin").map((c) => c.payload)).toEqual([{ p_member_id: "m1", p_key: "gp", p_count: 12 }]);
  });

  it("debits a posted coin drop as the negated coins, and debits nothing when the post fails", async () => {
    const purse = mountPurse();
    purse.coinDrop.value = { gp: 2 };
    chat.sendCurrencyDrop.mockRejectedValueOnce(new Error("offline"));
    await purse.submitCoinDrop();
    expect(rpcCalls("adjust_purse")).toEqual([]);

    chat.sendCurrencyDrop.mockResolvedValueOnce(undefined);
    await purse.submitCoinDrop();
    await flushPromises();
    expect(rpcCalls("adjust_purse").map((c) => c.payload)).toEqual([{ p_member_id: "m1", p_delta: { gp: -2 } }]);
  });
});

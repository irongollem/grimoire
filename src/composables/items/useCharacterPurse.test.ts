import { defineComponent, h, ref } from "vue";
import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query";
import { createPinia, setActivePinia } from "pinia";
import { useAuthStore } from "@/stores/auth";
import type { PartyMember } from "@/types/party.types";

const { fake, chat, partyRows } = await vi.hoisted(async () => {
  const { createSupabaseFake } = await import("@/test/supabaseFake");
  return { fake: createSupabaseFake(), chat: { sendCurrencyDrop: vi.fn() }, partyRows: { value: [] as { id: string; name: string }[] } };
});
vi.mock("@/lib/supabase", () => ({ supabase: fake.client, getCurrentUser: () => ({ id: "u1" }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => chat }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/party/useParty", () => ({
  useParty: () => ({ data: ref(partyRows.value) }),
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
  setActivePinia(createPinia());
  partyRows.value = [];
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

describe("useCharacterPurse giving coins", () => {
  // 13 Nov 2026: on another character's purse the form started on the first other
  // member, and its button already read "Give … to Irvine", so the DM moved coins to
  // Irvine meaning to give them to the character on screen.
  it("opens with nobody chosen, so nothing can be sent until the giver picks someone", () => {
    partyRows.value = [{ id: "m1", name: "Vex" }, { id: "m2", name: "Irvine" }];
    const purse = mountPurse();
    purse.openCoinGive();
    purse.coinGive.value = { gp: 2 };
    expect(purse.coinGiveCanSend.value).toBe(false);
    purse.coinGiveTo.value = "m2";
    expect(purse.coinGiveCanSend.value).toBe(true);
  });

  it("says whose coins leave: 'you' on your own purse, the character's name on anyone else's", () => {
    const auth = useAuthStore();
    const seatedAt = (party_member_id: string) => ({ role: "player", party_member_id }) as unknown as typeof auth.membership;
    auth.membership = seatedAt("m1");
    const own = mountPurse();
    own.coinGive.value = { gp: 2 };
    expect(own.coinGiveLeaves.value).toBe("Leaves you 3 gp.");

    auth.membership = seatedAt("someone-else");
    const theirs = mountPurse();
    theirs.coinGive.value = { gp: 2 };
    expect(theirs.coinGiveLeaves.value).toBe("Leaves Vex 3 gp.");
  });
});

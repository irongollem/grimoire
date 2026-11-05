// @vitest-environment jsdom
import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CharacterClass } from "@/types/multiclass.types";

// The class-rows queries, held still so a test decides when the rows "land".
const q = vi.hoisted(() => ({ member: null as unknown, campaign: null as unknown }));
vi.mock("@/composables/party/useCharacterClasses", () => ({
  useCharacterClasses: () => q.member,
  useAllCampaignCharacterClasses: () => q.campaign,
}));

import { useCampaignJackOfAllTrades, useJackOfAllTrades } from "./useJackOfAllTrades";

const bardRow = (memberId: string, levels: number) =>
  ({ party_member_id: memberId, capabilities: ["jack_of_all_trades"], levels }) as unknown as CharacterClass;

/** A query whose rows arrive when `land` is called; `suspense` resolves then. */
function pendingQuery(rows: CharacterClass[]) {
  const data = ref<CharacterClass[] | undefined>(undefined);
  let resolve!: () => void;
  const landed = new Promise<void>((r) => { resolve = r; });
  return {
    query: { data, suspense: vi.fn(() => landed) },
    land: () => { data.value = rows; resolve(); },
  };
}

function withSetup<T>(fn: () => T): T {
  let result!: T;
  mount(defineComponent({ setup() { result = fn(); return () => h("div"); } }));
  return result;
}

const toddy = { id: "m1", ruleset: "2014" as const };

describe("useJackOfAllTrades", () => {
  beforeEach(() => { q.member = null; });

  it("reads none for display while the rows load, then the real value", () => {
    const pending = pendingQuery([bardRow("m1", 2)]);
    q.member = pending.query;
    const { jack } = withSetup(() => useJackOfAllTrades(toddy));
    expect(jack.value).toBe("none");
    pending.land();
    expect(jack.value).toBe("any_check");
  });

  it("makes a roll wait for the rows rather than score a Bard short while they load", async () => {
    // #1147 review: a tap before the rows land must not roll with "none".
    const pending = pendingQuery([bardRow("m1", 2)]);
    q.member = pending.query;
    const { settledJack } = withSetup(() => useJackOfAllTrades(toddy));
    const settled = settledJack();
    pending.land();
    await expect(settled).resolves.toBe("any_check");
  });

  it("does not wait again once the rows are there", async () => {
    const pending = pendingQuery([bardRow("m1", 2)]);
    pending.land();
    q.member = pending.query;
    const { settledJack } = withSetup(() => useJackOfAllTrades(toddy));
    await expect(settledJack()).resolves.toBe("any_check");
    expect(pending.query.suspense).not.toHaveBeenCalled();
  });
});

describe("useCampaignJackOfAllTrades", () => {
  it("reads each character from its own rows, and a classless one as none", async () => {
    const pending = pendingQuery([bardRow("m1", 2), { party_member_id: "m2", capabilities: [], levels: 5 } as unknown as CharacterClass]);
    q.campaign = pending.query;
    const { jackFor, settled } = withSetup(() => useCampaignJackOfAllTrades());
    expect(jackFor(toddy)).toBe("none");
    const ready = settled();
    pending.land();
    await ready;
    expect(jackFor(toddy)).toBe("any_check");
    expect(jackFor({ id: "m2", ruleset: "2014" })).toBe("none");
    expect(jackFor({ id: "m3", ruleset: "2014" })).toBe("none");
  });
});

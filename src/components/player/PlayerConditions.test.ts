import { describe, expect, it, vi, beforeEach } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { ref } from "vue";
import type { PartyMember } from "@/types/party.types";
import type { RollResult } from "@/lib/dice/dice";

const updateMember = vi.fn(async () => undefined);
const prompts: { counts: Record<number, number>; label: string }[] = [];
let faces: number[] = [];

vi.mock("@/composables/party/useParty", () => ({ useUpdatePartyMember: () => ({ mutateAsync: updateMember }) }));
vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendRoll: vi.fn(async () => undefined) }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/rules/useRuleset", () => ({ useTableRuleset: () => ({ ruleset: ref("2014") }) }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({
  usePromptedRoll: () => ({
    promptRoll: async (ask: { counts: Record<number, number>; label: string }): Promise<RollResult> => {
      prompts.push(ask);
      const val = faces.shift() as number;
      return { total: val, label: ask.label, modifier: 0, breakdown: [{ val, dropped: false }], isCrit: false, isFumble: false };
    },
  }),
}));

import PlayerConditions from "./PlayerConditions.vue";

const dying = (conditions: PartyMember["conditions"]) =>
  ({ id: "pm-tam", name: "Tam", current_hp: 0, death_save_successes: 0, death_save_failures: 0, conditions, curses: [] }) as unknown as PartyMember;

async function rollDeathSave(member: PartyMember) {
  const wrapper = mount(PlayerConditions, { props: { member } });
  const button = wrapper.findAll("button").find((b) => b.text() === "Roll death save");
  await button?.trigger("click");
  await flushPromises();
}

describe("PlayerConditions death save", () => {
  beforeEach(() => {
    updateMember.mockClear();
    prompts.length = 0;
  });

  // PHB "Bless": a death saving throw is a saving throw, so a Blessed character rolls the d4 too and adds it: 8 + 2 = 10 succeeds.
  // Bug caught: the boon never asked for, so the 8 is written as a failure.
  it("fails if a Blessed character's death save does not ask for the d4 and count it", async () => {
    faces = [8, 2];
    await rollDeathSave(dying([{ name: "Unconscious" }, { name: "Bless", grants: { attack: "1d4", save: "1d4" } }]));
    expect(prompts.map((p) => p.counts)).toEqual([{ 20: 1 }, { 4: 1 }]);
    expect(updateMember).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ death_save_successes: 1, death_save_failures: 0 }) }));
  });

  // A natural 20 or 1 is decided on the d20 alone, and a character with no boon is asked for nothing more. Bug caught: a d4 asked for
  // on a natural 20, or for a character with no boon.
  it("fails if a d4 is asked for on a natural 20 or for a character with no boon", async () => {
    faces = [20];
    await rollDeathSave(dying([{ name: "Unconscious" }, { name: "Bless", grants: { attack: "1d4", save: "1d4" } }]));
    faces = [8];
    await rollDeathSave(dying([{ name: "Unconscious" }]));
    expect(prompts.map((p) => p.counts)).toEqual([{ 20: 1 }, { 20: 1 }]);
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import SkillRollList from "./SkillRollList.vue";
import type { PartyMember } from "@/types/party.types";

vi.mock("@/composables/campaign/useCampaignMessages", () => ({ useCampaignMessages: () => ({ sendFlavorMessage: vi.fn() }) }));
vi.mock("@/composables/campaign/chatSendErrors", () => ({ useChatSendFailure: () => ({ reportChatFailure: vi.fn() }) }));
vi.mock("@/composables/dice/usePromptedRoll", () => ({ usePromptedRoll: () => ({ promptRoll: vi.fn() }) }));
vi.mock("@/composables/campaign/useCampaignMembers", () => ({ useCampaignMembers: () => ({ data: ref([]) }) }));
vi.mock("@/composables/campaign/useWhisperRecipients", () => ({
  useWhisperRecipients: () => ({ allowedIds: ref(new Set()), query: { isSuccess: ref(true) } }),
}));
vi.mock("@/stores/campaign", () => ({ useCampaignStore: () => ({ activeCampaign: null }) }));
vi.mock("@/stores/auth", () => ({ useAuthStore: () => ({ user: null }) }));

const member = {
  name: "Wren", str: 10, dex: 14, con: 10, int: 10, wis: 10, cha: 10, proficiency_bonus: 2,
  skill_proficiencies: { stealth: "expertise", perception: "proficient" },
} as unknown as PartyMember;

function mountList(density?: "list" | "compact") {
  return mount(SkillRollList, {
    props: { member, checkDisadvantage: false, checkPenalty: 0, density },
    global: { directives: { "roll-mode": {} } },
  });
}

describe("SkillRollList", () => {
  it("lists all eighteen skills in the Skills tab layout", () => {
    const w = mountList();
    expect(w.findAll("button")).toHaveLength(18);
    expect(w.text()).toContain("DEX");
  });

  it("compact is one two-column grid of eighteen, without ability tags", () => {
    const w = mountList("compact");
    const grid = w.get("[data-skill-compact]");
    expect(grid.classes()).toEqual(expect.arrayContaining(["grid-cols-2", "grid-flow-col", "grid-rows-9"]));
    expect(w.findAll("button")).toHaveLength(18);
    expect(w.text()).not.toContain("DEX");
  });

  it("scores a skill from the member's proficiency", () => {
    expect(mountList("compact").text()).toContain("Stealth");
    expect(mountList("compact").text()).toContain("+6");
  });
});

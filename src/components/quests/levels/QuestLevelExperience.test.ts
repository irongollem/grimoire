import { mount, RouterLinkStub } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import QuestLevelExperience from "./QuestLevelExperience.vue";
import type { PartyMember } from "@/types/party.types";
import type { Quest } from "@/types/quest.types";

const member = (id: string, xp: number) => ({ id, name: id, level: 3, experience_points: xp }) as PartyMember;
const quest = (id: string, over: Partial<Quest> = {}) =>
  ({ id, title: id, status: "active", xp_reward: 1800, xp_awarded_at: null, ...over }) as Quest;

describe("QuestLevelExperience", () => {
  // CodeRabbit on #1227: a quest paid once and reopened pays nothing again (`award_quest_xp`), so promising its share
  // misleads the DM.
  it("does not count a quest that has already paid its XP", () => {
    const w = mount(QuestLevelExperience, {
      props: {
        party: [member("a", 2250), member("b", 2300)],
        quests: [quest("Paid already", { xp_awarded_at: "2026-11-19T00:00:00Z" }), quest("Still to pay")],
      },
      global: { stubs: { RouterLink: RouterLinkStub, QuestLevelFlags: true } },
    });
    expect(w.text()).toContain("Still to pay");
    expect(w.text()).not.toContain("Paid already");
  });
});

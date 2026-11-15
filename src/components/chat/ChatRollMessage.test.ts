import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ChatRollMessage from "./ChatRollMessage.vue";
import type { RollMetadata } from "@/types/chat.types";

const roll = { total: 11, label: "2d6+3", modifier: 3, breakdown: [{ val: 4, dropped: false }], isCrit: false, isFumble: false } as RollMetadata;
const base = { senderName: "Mira", roll, timeLabel: "12:00" };

describe("ChatRollMessage server mark", () => {
  it.each([false, true])("shows 'Rolled by Grimoire' only for a server roll (dm_roll: %s)", (isDmRoll) => {
    const stamped = mount(ChatRollMessage, { props: { ...base, isDmRoll, serverRolled: true } });
    expect(stamped.get("[data-testid=server-rolled-mark]").text()).toContain("Rolled by Grimoire");
    const typed = mount(ChatRollMessage, { props: { ...base, isDmRoll } });
    expect(typed.find("[data-testid=server-rolled-mark]").exists()).toBe(false);
    expect(typed.text()).not.toContain("Rolled by Grimoire");
  });
});

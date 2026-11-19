import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import SoloRolled from "./SoloRolled.vue";

const line = { total: "17", title: "Inkling rolled Wisdom (Perception)", detail: "d20 (13) + 4" };

describe("SoloRolled", () => {
  // Bug caught: the player's own roll stamped as the server's, when the design says it is written in as theirs.
  it("carries the server's mark only on a roll the server made", () => {
    expect(mount(SoloRolled, { props: { line } }).text()).not.toContain("Rolled by Grimoire");
    expect(mount(SoloRolled, { props: { line, byServer: true } }).text()).toContain("Rolled by Grimoire");
  });
});

import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";

vi.mock("./WorldTime.vue", () => ({ default: { template: "<div data-testid='world-time' />" } }));
vi.mock("./WorldCoins.vue", () => ({ default: { template: "<div data-testid='world-coins' />" } }));

vi.mock("./WorldAlmanac.vue", () => ({ default: { template: "<div data-testid='world-almanac' />" } }));

import WorldChapter from "./WorldChapter.vue";

describe("WorldChapter", () => {
  // Bug (#1255 item 31): Peoples was left here as well as in Who and what lives here, so the shares were editable in two places.
  it("keeps time, coins and the timeline, and no longer mounts the peoples", () => {
    const w = mount(WorldChapter);
    expect(w.find("[data-testid=world-time]").exists()).toBe(true);
    expect(w.find("[data-testid=world-coins]").exists()).toBe(true);
    expect(w.find("[data-testid=world-almanac]").exists()).toBe(true);
    expect(w.find("[data-testid=world-peoples]").exists()).toBe(false);
    expect(w.text()).not.toContain("Who lives in it");
  });
});

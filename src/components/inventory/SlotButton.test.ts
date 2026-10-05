import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SlotButton from "./SlotButton.vue";

describe("SlotButton", () => {
  it("says what is worn when the slot is filled", () => {
    const item = { name: "Cloak of Protection" } as never;
    const w = mount(SlotButton, { props: { item, label: "Shldr", place: "shoulders" } });
    expect(w.attributes("aria-label")).toBe("Shldr: Cloak of Protection");
  });

  it("explains a disabled slot in the player's words", () => {
    const w = mount(SlotButton, { props: { item: null, label: "Boots", place: "feet", disabled: true } });
    expect(w.attributes("aria-label")).toBe("Nothing to wear on your feet yet");
    expect(w.attributes("disabled")).toBeDefined();
  });

  it("invites equipping when something fits", () => {
    const w = mount(SlotButton, { props: { item: null, label: "Head", place: "head" } });
    expect(w.attributes("aria-label")).toBe("Equip something on your head");
  });
});

import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import GiveCountPicker from "./GiveCountPicker.vue";

function make(quantity = 5, extra: Record<string, unknown> = {}) {
  return mount(GiveCountPicker, { props: { name: "Arrow", quantity, targetName: "Mira", ...extra } });
}

function input(w: ReturnType<typeof make>) {
  return w.find("input").element as HTMLInputElement;
}

describe("GiveCountPicker", () => {
  it("defaults to the whole stack and confirms it as null", async () => {
    const w = make();
    expect(input(w).value).toBe("5");
    expect(w.text()).toContain("Give 5 to Mira");
    await w.find("button.flex-1").trigger("click");
    expect(w.emitted("confirm")).toEqual([[null]]);
  });

  it("emits the chosen count when it is less than the stack", async () => {
    const w = make();
    await w.find('button[aria-label="One fewer"]').trigger("click");
    await w.find('button[aria-label="One fewer"]').trigger("click");
    await w.find("button.flex-1").trigger("click");
    expect(w.emitted("confirm")).toEqual([[3]]);
  });

  it("clamps typed values to 1..quantity", async () => {
    const w = make();
    await w.find("input").setValue("0");
    expect(input(w).value).toBe("1");
    await w.find("input").setValue("99");
    expect(input(w).value).toBe("5");
    await w.find("input").setValue("2");
    await w.find("input").setValue("abc");
    expect(input(w).value).toBe("1");
  });

  it("gives a whole number: 2.9 means 2", async () => {
    const w = make();
    await w.find("input").setValue("2.9");
    await w.find("button.flex-1").trigger("click");
    expect(w.emitted("confirm")).toEqual([[2]]);
  });

  it("disables the steppers at the ends", async () => {
    const w = make(2);
    expect(w.find('button[aria-label="One more"]').attributes("disabled")).toBeDefined();
    await w.find('button[aria-label="One fewer"]').trigger("click");
    expect(w.find('button[aria-label="One fewer"]').attributes("disabled")).toBeDefined();
  });

  it("can drop the target from the confirm label", () => {
    expect(make(5, { shortLabel: true }).text()).toContain("Give 5");
    expect(make(5, { shortLabel: true }).find("button.flex-1").text()).toBe("Give 5");
  });

  it("emits back", async () => {
    const w = make();
    const back = w.findAll("button").find((b) => b.text() === "Back");
    await back?.trigger("click");
    expect(w.emitted("back")).toHaveLength(1);
  });
});

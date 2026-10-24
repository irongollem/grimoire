import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import CalendarDateInput from "./CalendarDateInput.vue";

function mountInput(modelValue: { year: number | null; month: number | null; day: number | null }) {
  setActivePinia(createPinia());
  return mount(CalendarDateInput, { props: { modelValue, label: "Birth" } });
}

describe("CalendarDateInput", () => {
  it("hides the day until a month is chosen and disables the month without a year", () => {
    const w = mountInput({ year: null, month: null, day: null });
    expect(w.findAll("input")).toHaveLength(1);
    expect(w.find("select").attributes("disabled")).toBeDefined();
    const dated = mountInput({ year: 1448, month: 2, day: 3 });
    expect(dated.findAll("input")).toHaveLength(2);
  });

  it("clears the month and day when the month goes back to unknown", async () => {
    const w = mountInput({ year: 1448, month: 2, day: 3 });
    await w.find("select").setValue("0");
    const emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ year: 1448, month: null, day: null });
  });

  it("clears all three when the year is cleared, and never emits an empty string", async () => {
    const w = mountInput({ year: 1448, month: 2, day: 3 });
    await w.findAll("input")[0]!.setValue("");
    const emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ year: null, month: null, day: null });
  });

  it("names its controls after the label", () => {
    setActivePinia(createPinia());
    const w = mount(CalendarDateInput, {
      props: { modelValue: { year: 1491, month: 2, day: 3 }, label: "Death" },
    });
    expect(w.find('input[aria-label="Death year"]').exists()).toBe(true);
    expect(w.find('select[aria-label="Death month"]').exists()).toBe(true);
    expect(w.find('input[aria-label="Death day"]').exists()).toBe(true);
  });

  it("starts a chosen month on day 1", async () => {
    const w = mountInput({ year: 1448, month: null, day: null });
    await w.find("select").setValue("1");
    const emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ year: 1448, month: 1, day: 1 });
  });

  it("keeps a typed year, and a typed day within the month", async () => {
    const w = mountInput({ year: null, month: null, day: null });
    await w.findAll("input")[0]!.setValue("1448");
    let emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ year: 1448, month: null, day: null });

    const dated = mountInput({ year: 1448, month: 2, day: 1 });
    await dated.findAll("input")[1]!.setValue("12");
    emitted = dated.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ year: 1448, month: 2, day: 12 });
  });
});

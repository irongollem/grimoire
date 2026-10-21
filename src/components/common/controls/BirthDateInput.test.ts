import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import BirthDateInput from "./BirthDateInput.vue";

function mountInput(modelValue: { born_year: number | null; born_month: number | null; born_day: number | null }) {
  setActivePinia(createPinia());
  return mount(BirthDateInput, { props: { modelValue } });
}

describe("BirthDateInput", () => {
  it("hides the day until a month is chosen and disables the month without a year", () => {
    const w = mountInput({ born_year: null, born_month: null, born_day: null });
    expect(w.findAll("input")).toHaveLength(1);
    expect(w.find("select").attributes("disabled")).toBeDefined();
    const dated = mountInput({ born_year: 1448, born_month: 2, born_day: 3 });
    expect(dated.findAll("input")).toHaveLength(2);
  });

  it("clears the month and day when the month goes back to unknown", async () => {
    const w = mountInput({ born_year: 1448, born_month: 2, born_day: 3 });
    await w.find("select").setValue("0");
    const emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ born_year: 1448, born_month: null, born_day: null });
  });

  it("clears all three when the year is cleared, and never emits an empty string", async () => {
    const w = mountInput({ born_year: 1448, born_month: 2, born_day: 3 });
    await w.findAll("input")[0]!.setValue("");
    const emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ born_year: null, born_month: null, born_day: null });
  });

  it("starts a chosen month on day 1", async () => {
    const w = mountInput({ born_year: 1448, born_month: null, born_day: null });
    await w.find("select").setValue("1");
    const emitted = w.emitted("update:modelValue")!;
    expect(emitted[emitted.length - 1]![0]).toEqual({ born_year: 1448, born_month: 1, born_day: 1 });
  });
});

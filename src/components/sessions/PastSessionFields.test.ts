import { mount } from "@vue/test-utils";
import { VueDatePicker } from "@vuepic/vue-datepicker";
import { describe, expect, it } from "vitest";
import PastSessionFields, { isPastSessionComplete, pastSessionInput } from "./PastSessionFields.vue";

describe("past session draft", () => {
  it("needs a day and nothing else", () => {
    expect(isPastSessionComplete({ number: null, title: "", playedOn: "" })).toBe(false);
    expect(isPastSessionComplete({ number: null, title: "", playedOn: "2026-10-04" })).toBe(true);
  });

  it("turns a blank title and a missing number into nulls", () => {
    expect(pastSessionInput({ number: null, title: "  ", playedOn: "2026-10-04" })).toEqual({
      number: null,
      title: null,
      played_on: "2026-10-04",
    });
    expect(pastSessionInput({ number: 7, title: " Ashes ", playedOn: "2026-10-04" })).toEqual({
      number: 7,
      title: "Ashes",
      played_on: "2026-10-04",
    });
    expect(pastSessionInput({ number: 7, title: "", playedOn: "" })).toBeNull();
  });
});

describe("PastSessionFields", () => {
  it("shows the prefilled draft and writes edits back whole", async () => {
    const updates: unknown[] = [];
    const wrapper = mount(PastSessionFields, {
      props: {
        modelValue: { number: 14, title: "", playedOn: "2026-10-04" },
        "onUpdate:modelValue": (v: unknown) => updates.push(v),
      },
      global: { stubs: { VueDatePicker: true } },
    });
    const number = wrapper.get("input[type=number]");
    expect((number.element as HTMLInputElement).value).toBe("14");
    await wrapper.get("input[type=text]").setValue("Ashes");
    expect(updates.at(-1)).toEqual({ number: 14, title: "Ashes", playedOn: "2026-10-04" });
  });

  it("hands the picker null for no day, and a cleared day back as an empty draft day", async () => {
    const updates: Array<{ playedOn: string }> = [];
    const wrapper = mount(PastSessionFields, {
      props: {
        modelValue: { number: 14, title: "", playedOn: "" },
        "onUpdate:modelValue": (v: { playedOn: string }) => updates.push(v),
      },
      global: { stubs: { VueDatePicker: true } },
    });
    const picker = wrapper.findComponent(VueDatePicker);
    expect(picker.props("modelValue")).toBeNull();
    picker.vm.$emit("update:modelValue", "2026-10-05");
    expect(updates.at(-1)?.playedOn).toBe("2026-10-05");
    picker.vm.$emit("update:modelValue", null);
    expect(updates.at(-1)?.playedOn).toBe("");
  });
});

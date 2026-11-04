import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import EventModalDatePicker from "./EventModalDatePicker.vue";

const props = {
  dateType: "regular" as const,
  year: 1,
  month: 2,
  day: 1,
  festivalDay: null,
  isMultiDay: true,
  endYear: 1,
  endMonth: 2,
  endDay: 1,
  months: [
    { num: 1, name: "One", days: 30 },
    { num: 2, name: "Two", days: 28 },
  ],
  availableFestivals: [],
};

describe("EventModalDatePicker", () => {
  // Bug it fails on: both day inputs had max="30" hard-coded, so a 28- or 31-day month was mis-capped.
  it("caps the day inputs at the limits it is given, not at 30", () => {
    const w = mount(EventModalDatePicker, { props: { ...props, dayMax: 28, endDayMax: 31 } });
    const maxes = w.findAll('input[type="number"]').map((i) => i.attributes("max"));
    expect(maxes).toContain("28");
    expect(maxes).toContain("31");
    expect(maxes).not.toContain("30");
  });
});

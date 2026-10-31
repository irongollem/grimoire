import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PictureGridFields from "./PictureGridFields.vue";
import { calibrationFor } from "@/lib/mapBring/pictureGrid";
import type { GridCalibration } from "@/types/location.types";

const natural = { width: 3000, height: 2000 };

function mountFields(props: { squareFeet?: 5 | 10; boxMode?: boolean } = {}) {
  let calibration: GridCalibration = calibrationFor(natural, 30);
  const wrapper = mount(PictureGridFields, {
    props: {
      natural,
      modelValue: calibration,
      "onUpdate:modelValue": (v: GridCalibration) => { calibration = v; },
      ...props,
    },
  });
  return { wrapper, calibration: () => calibration };
}

describe("PictureGridFields", () => {
  it("reads the squares down from the picture's shape: 30 across on a 3:2 picture is 20 down", () => {
    expect(mountFields().wrapper.text()).toContain("20");
    expect(mountFields().wrapper.text()).toContain("from the picture's shape");
  });

  it("changes the squares across when a number is typed and committed", async () => {
    const { wrapper, calibration } = mountFields();
    const input = wrapper.get('input[aria-label="Squares across"]');
    await input.setValue("20");
    await input.trigger("change");
    expect(calibration().cells_per_image_width).toBe(20);
  });

  it("keeps the grid when the field is cleared, rather than writing zero squares", async () => {
    const { wrapper, calibration } = mountFields();
    const input = wrapper.get('input[aria-label="Squares across"]');
    await input.setValue("");
    await input.trigger("change");
    expect(calibration().cells_per_image_width).toBe(30);
  });

  it("ignores less than one square across", async () => {
    const { wrapper, calibration } = mountFields();
    const input = wrapper.get('input[aria-label="Squares across"]');
    await input.setValue("0");
    await input.trigger("change");
    expect(calibration().cells_per_image_width).toBe(30);
  });

  it("asks how big a square is only where the host wants to know (Bring a map)", () => {
    expect(mountFields().wrapper.text()).not.toContain("Each square");
    expect(mountFields({ squareFeet: 5 }).wrapper.text()).toContain("Each square");
  });

  it("turns box mode on and off from its button", async () => {
    const { wrapper } = mountFields();
    await wrapper.get("button[aria-pressed]").trigger("click");
    expect(wrapper.emitted("update:boxMode")![0]).toEqual([true]);
  });
});

// The Base image tab's slip: Trace the walls, and Find walls in the picture beside it (#1197).
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import CartographerPictureOptions from "./CartographerPictureOptions.vue";

function mountSlip(over: Record<string, unknown> = {}) {
  return mount(CartographerPictureOptions, {
    props: {
      hasPicture: true, calibrated: true, moving: false, battleMap: false, busy: false, liningUp: false, natural: null,
      ...over,
    },
    global: { stubs: { MapPictureControls: true } },
  });
}
const button = (w: ReturnType<typeof mountSlip>, label: string) => w.findAll("button").find((b) => b.text() === label);

describe("Find walls in the picture", () => {
  it("sits beside Trace the walls once the grid is lined up, and asks for the walls when pressed", async () => {
    const w = mountSlip();
    expect(button(w, "Trace the walls")).toBeDefined();
    await button(w, "Find walls in the picture")!.trigger("click");
    expect(w.emitted("find-walls")).toHaveLength(1);
  });

  it.each([
    ["a picture whose grid is not lined up", { calibrated: false }],
    ["no picture", { hasPicture: false, calibrated: false }],
  ])("is not offered for %s", (_name, over) => {
    expect(button(mountSlip(over), "Find walls in the picture")).toBeUndefined();
  });
});

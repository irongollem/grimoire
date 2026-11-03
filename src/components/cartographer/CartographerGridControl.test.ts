import { afterEach, describe, expect, it } from "vitest";
import { enableAutoUnmount, flushPromises, mount } from "@vue/test-utils";
import CartographerGridControl from "./CartographerGridControl.vue";

enableAutoUnmount(afterEach);

function control(over: Record<string, unknown> = {}) {
  return mount(CartographerGridControl, {
    props: { shown: true, strength: "faint", squareText: null, canLineUp: false, ...over },
  });
}
const dialogButtons = () => [...document.body.querySelectorAll<HTMLElement>("[role=dialog] button")];
async function openOptions(w: ReturnType<typeof control>) {
  await w.find('[aria-label="Grid options"]').trigger("click");
  await flushPromises();
}

describe("the Grid control", () => {
  it("is a pressed-state button that asks to flip the grid", async () => {
    const w = control({ shown: true });
    const button = w.findAll("button").find((b) => b.text() === "Grid")!;
    expect(button.attributes("aria-pressed")).toBe("true");
    await button.trigger("click");
    expect(w.emitted("update:shown")?.[0]).toEqual([false]);
    expect(control({ shown: false }).findAll("button").find((b) => b.text() === "Grid")!.attributes("aria-pressed")).toBe("false");
  });

  it("offers Faint, Clear and Bold behind its caret and reports the choice", async () => {
    const w = control();
    await openOptions(w);
    expect(dialogButtons().map((b) => b.textContent)).toEqual(expect.arrayContaining(["Faint", "Clear", "Bold"]));
    dialogButtons().find((b) => b.textContent === "Bold")?.click();
    expect(w.emitted("update:strength")?.[0]).toEqual(["bold"]);
  });

  it("reads out the square's size only when the base image has a grid, and offers the line-up only with a base image", async () => {
    const none = control();
    await openOptions(none);
    expect(document.body.textContent).not.toContain("on the picture");
    expect(dialogButtons().some((b) => b.textContent?.includes("Line up with the base image"))).toBe(false);
    none.unmount();

    const lined = control({ squareText: "5 ft · 64 px on the picture", canLineUp: true });
    await openOptions(lined);
    expect(document.body.textContent).toContain("5 ft · 64 px on the picture");
    dialogButtons().find((b) => b.textContent?.includes("Line up with the base image"))?.click();
    expect(lined.emitted("lineUp")).toHaveLength(1);
  });
});

// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import IlluminateExportMenu from "./IlluminateExportMenu.vue";

const menu = (isPro: boolean) => mount(IlluminateExportMenu, { props: { isPro, copied: false, clipboardSupported: true } });

describe("IlluminateExportMenu", () => {
  // Fails if the PNG download is open to Free (a Pro extra) or shut on Pro.
  it("greys PNG out on Free and opens it on Pro", () => {
    expect(menu(false).get('[data-testid="download-png"]').attributes("disabled")).toBeDefined();
    expect(menu(true).get('[data-testid="download-png"]').attributes("disabled")).toBeUndefined();
  });

  // Fails if WebP, the download every plan keeps, is ever gated.
  it("keeps the WebP download open on Free", async () => {
    const free = menu(false);
    const webp = free.get('[data-testid="download-webp"]');
    expect(webp.attributes("disabled")).toBeUndefined();
    await webp.trigger("click");
    expect(free.emitted("webp")).toHaveLength(1);
  });
});

// @vitest-environment happy-dom
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import FooterPanelSection from "./FooterPanelSection.vue";

const settings = { showPageNumbers: true, pageNumberStart: 1, footerText: "", footerTitle: "chapter", footerStyle: "plain" } as const;
const markers = { noFooter: false, dontCount: false, restart: false };

describe("FooterPanelSection footer style", () => {
  // Fails on: the Ribbon choice being drawn but never written, so the footer stays plain in the book.
  it("writes the ribbon choice as a footer style patch", async () => {
    const w = mount(FooterPanelSection, { props: { pageLabel: "3", settings, markers } });
    await w.findAll("button").find((b) => b.text() === "Ribbon")!.trigger("click");
    expect(w.emitted("settings")).toEqual([[{ footerStyle: "ribbon" }]]);
  });
});

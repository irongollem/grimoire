import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import AppButton from "@/components/common/AppButton.vue";

const cls = (props: Record<string, unknown>) =>
  mount(AppButton, { props: { label: "x", ...props } }).find("button").attributes("class") ?? "";

/**
 * `press` is `fill`'s twin on `active:` — added for the md:hidden screens, which
 * avoid `:hover` because it sticks after a tap on touch.
 *
 * `dim` is the value that needs a test rather than a catalogue entry: it works by
 * *cancelling* something the variant already emits, and that cancellation depends
 * on tailwind-merge resolving two `hover:opacity-*` classes against each other in
 * the right order. A silent regression there would put the sticky hover back
 * without changing a single call site.
 */
describe("press=dim on a solid variant", () => {
  it("cancels the baked hover dim and moves it to active", () => {
    const c = cls({ variant: "primary", press: "dim" });
    expect({
      bakedHoverGone: !/\bhover:opacity-90\b/.test(c),
      hoverNeutralised: /\bhover:opacity-100\b/.test(c),
      pressed: /\bactive:opacity-90\b/.test(c),
    }).toEqual({ bakedHoverGone: true, hoverNeutralised: true, pressed: true });
  });

  it("leaves the baked hover alone when press is not asked for", () => {
    expect(/\bhover:opacity-90\b/.test(cls({ variant: "primary" }))).toBe(true);
  });
});

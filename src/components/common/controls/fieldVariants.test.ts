import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import { h, ref } from "vue";
import { fieldVariants, FIELD_SIZES, FIELD_TONES } from "./fieldVariants";
import AppInput from "./AppInput.vue";
import AppSelect from "./AppSelect.vue";

describe("fieldVariants", () => {
  /**
   * The DashboardView day/month/year row puts an input, a select and an input side
   * by side, so their vertical metrics have to agree. Note this checks the emitted
   * *classes*, not rendered height — happy-dom does no layout. Equal classes are
   * necessary but not sufficient: measured in a real browser, `xs` still renders a
   * 16px select against a 20px input, because a native input has a UA minimum
   * content height that padding alone does not overcome. Every other size matches.
   */
  it("gives an input and a select the same vertical classes at every size", () => {
    for (const size of FIELD_SIZES) {
      const vertical = (control: "input" | "select") =>
        fieldVariants({ size, control })
          .split(" ")
          .filter(c => /^(py-|min-h-|md:min-h-|rounded)/.test(c))
          .sort()
          .join(" ");
      expect(vertical("input"), `size ${size}`).toBe(vertical("select"));
    }
  });

  it("every tone but bare draws a border", () => {
    for (const tone of FIELD_TONES.filter(t => t !== "bare")) {
      expect(fieldVariants({ tone }), `tone ${tone}`).toContain("border-border");
    }
  });
});

// The point of the extraction: one recipe, not three near-copies. If a component
// stops consuming it, these diverge.
describe("the field components share one box", () => {
  const boxClasses = (cls: string) =>
    cls
      .split(" ")
      .filter(c => /^(border|rounded|focus:ring|bg-card)/.test(c))
      .sort()
      .join(" ");

  it("AppInput and AppSelect agree on border, radius and focus ring", () => {
    const input = mount(AppInput, { props: { modelValue: "", tone: "card", size: "sm" } });
    const model = ref("a");
    const select = mount({
      setup: () => () =>
        h(AppSelect as never, { modelValue: model.value }, () => [
          h("option", { value: "a" }, "A"),
        ]),
    });
    expect(boxClasses(input.attributes("class") ?? "")).toBe(
      boxClasses(select.find("select").attributes("class") ?? ""),
    );
    input.unmount();
    select.unmount();
  });
});

describe("field shape (#648)", () => {
  // Asserted on a mount, not on fieldVariants() output: cva only concatenates, so
  // the raw string legitimately carries both the size's `rounded` and the shape's
  // `rounded-full`. Which one survives is decided by cn()/tailwind-merge at render,
  // and that is what a call site actually gets.
  it("rounds fully, beating the size's own radius", () => {
    for (const size of ["xs", "sm", "body", "caption"] as const) {
      const cls = mount(AppInput, {
        props: { modelValue: "", size, shape: "pill" },
      }).get("input").classes();
      expect(cls, size).toContain("rounded-full");
      expect(cls.filter((c) => c.startsWith("rounded")), size).toEqual(["rounded-full"]);
    }
  });

  it("defaults to the size's own radius", () => {
    const cls = mount(AppInput, { props: { modelValue: "", size: "sm" } }).get("input").classes();
    expect(cls).toContain("rounded-md");
    expect(cls).not.toContain("rounded-full");
  });
})

describe("underline tone (#648)", () => {
  // `rounded-none` is load-bearing: every size sets a radius, and a rounded box with
  // only a bottom border renders as a stray curved rule. It is declared inside the
  // tone rather than left to the size for exactly that reason.
  it("draws a bottom rule and no box", () => {
    const cls = mount(AppInput, { props: { modelValue: "", tone: "underline" } })
      .get("input").classes();
    expect(cls).toContain("border-b");
    expect(cls).toContain("bg-transparent");
    expect(cls).toContain("rounded-none");
    expect(cls).not.toContain("rounded-md");
  });
});
